using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace CortexApi.Services;

public interface IVoiceService
{
    Task HandleSttWebSocketAsync(WebSocket webSocket);
    Task<byte[]> GenerateTtsAsync(string text);
}

public class VoiceService : IVoiceService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<VoiceService> _logger;

    public VoiceService(HttpClient httpClient, IConfiguration configuration, ILogger<VoiceService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task HandleSttWebSocketAsync(WebSocket webSocket)
    {
        var sttUrl = _configuration["STT_URL"] ?? "http://faster-whisper:8001";
        var buffer = new byte[1024 * 4];

        try
        {
            // Create WebSocket connection to STT service
            using var clientWebSocket = new ClientWebSocket();
            var sttUri = new Uri($"{sttUrl.Replace("http://", "ws://")}/ws");
            await clientWebSocket.ConnectAsync(sttUri, CancellationToken.None);

            // Relay audio data from client to STT service
            var relayToStt = Task.Run(async () =>
            {
                try
                {
                    while (webSocket.State == WebSocketState.Open && clientWebSocket.State == WebSocketState.Open)
                    {
                        var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                        
                        if (result.MessageType == WebSocketMessageType.Binary)
                        {
                            await clientWebSocket.SendAsync(
                                new ArraySegment<byte>(buffer, 0, result.Count),
                                WebSocketMessageType.Binary,
                                result.EndOfMessage,
                                CancellationToken.None);
                        }
                        else if (result.MessageType == WebSocketMessageType.Close)
                        {
                            break;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error relaying audio to STT service");
                }
            });

            // Relay transcription results from STT service to client
            var relayFromStt = Task.Run(async () =>
            {
                try
                {
                    while (webSocket.State == WebSocketState.Open && clientWebSocket.State == WebSocketState.Open)
                    {
                        var result = await clientWebSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                        
                        if (result.MessageType == WebSocketMessageType.Text)
                        {
                            await webSocket.SendAsync(
                                new ArraySegment<byte>(buffer, 0, result.Count),
                                WebSocketMessageType.Text,
                                result.EndOfMessage,
                                CancellationToken.None);
                        }
                        else if (result.MessageType == WebSocketMessageType.Close)
                        {
                            break;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error relaying transcription from STT service");
                }
            });

            await Task.WhenAny(relayToStt, relayFromStt);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in STT WebSocket handling");
        }
        finally
        {
            if (webSocket.State == WebSocketState.Open)
            {
                await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
            }
        }
    }

    public async Task<byte[]> GenerateTtsAsync(string text)
    {
        try
        {
            var ttsUrl = _configuration["TTS_URL"] ?? "http://piper:8002";
            var requestData = new { text = text };
            var json = JsonSerializer.Serialize(requestData);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync($"{ttsUrl}/synthesize", content);
            response.EnsureSuccessStatusCode();

            return await response.Content.ReadAsByteArrayAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating TTS for text: {Text}", text);
            return Array.Empty<byte>();
        }
    }
}
