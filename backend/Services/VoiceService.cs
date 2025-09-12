using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Net.Http.Headers;
using CortexApi.Controllers;
using CortexApi.Services;

namespace CortexApi.Services;

public interface IVoiceService
{
    Task HandleSttWebSocketAsync(WebSocket webSocket);
    Task<byte[]> GenerateTtsAsync(string text);
    Task<VoiceConfigValidationResult> ValidateVoiceConfigAsync(VoiceConfigRequest request);
}

public class VoiceService : IVoiceService
{
    private readonly HttpClient _httpClient;
    private readonly IConfigurationService _configurationService;
    private readonly ILogger<VoiceService> _logger;
    
    private readonly HashSet<string> _supportedLanguages = new()
    {
        "en-US", "en-GB", "es-ES", "es-MX", "fr-FR", "de-DE", "it-IT", "pt-BR", "zh-CN", "ja-JP", "ko-KR"
    };
    
    private readonly HashSet<string> _supportedWakeWords = new()
    {
        "cortex", "hey cortex", "computer", "assistant"
    };

    public VoiceService(HttpClient httpClient, IConfigurationService configurationService, ILogger<VoiceService> logger)
    {
        _httpClient = httpClient;
        _configurationService = configurationService;
        _logger = logger;
    }

    public async Task<VoiceConfigValidationResult> ValidateVoiceConfigAsync(VoiceConfigRequest request)
    {
        var result = new VoiceConfigValidationResult();
        var errors = new List<string>();
        var warnings = new List<string>();

        // Validate voice language
        if (!string.IsNullOrEmpty(request.VoiceLanguage))
        {
            if (!_supportedLanguages.Contains(request.VoiceLanguage))
            {
                errors.Add($"Voice language '{request.VoiceLanguage}' is not supported. Supported languages: {string.Join(", ", _supportedLanguages)}");
            }
        }

        // Validate voice speed
        if (request.VoiceSpeed.HasValue)
        {
            if (request.VoiceSpeed < 0.25 || request.VoiceSpeed > 4.0)
            {
                errors.Add("Voice speed must be between 0.25 and 4.0");
            }
            else if (request.VoiceSpeed < 0.5 || request.VoiceSpeed > 2.0)
            {
                warnings.Add("Voice speed outside typical range (0.5-2.0) may sound unnatural");
            }
        }

        // Validate microphone sensitivity
        if (request.MicrophoneSensitivity.HasValue)
        {
            if (request.MicrophoneSensitivity < 0.0 || request.MicrophoneSensitivity > 1.0)
            {
                errors.Add("Microphone sensitivity must be between 0.0 and 1.0");
            }
        }

        // Validate wake word
        if (!string.IsNullOrEmpty(request.WakeWord))
        {
            if (!_supportedWakeWords.Contains(request.WakeWord))
            {
                warnings.Add($"Wake word '{request.WakeWord}' may not be optimally recognized. Recommended wake words: {string.Join(", ", _supportedWakeWords)}");
            }
            
            if (request.WakeWord.Length < 3)
            {
                errors.Add("Wake word must be at least 3 characters long");
            }
        }

        result.IsValid = errors.Count == 0;
        result.Errors = errors;
        result.Warnings = warnings;

        return result;
    }

    public async Task HandleSttWebSocketAsync(WebSocket webSocket)
    {
        var config = _configurationService.GetConfiguration();
        var sttUrl = config["Voice:SttUrl"] ?? config["STT_URL"] ?? "http://localhost:8001";
        
        _logger.LogInformation("Handling STT WebSocket connection with URL: {SttUrl}", sttUrl);

        try
        {
            var sttProvider = config["Voice:SttProvider"] ?? config["STT_PROVIDER"] ?? string.Empty;
            var openAiKey = config["OpenAI:ApiKey"] ?? config["OPENAI_API_KEY"];

            if (sttProvider.ToLowerInvariant() == "openai" && !string.IsNullOrEmpty(openAiKey))
            {
                await HandleOpenAiSttAsync(webSocket, openAiKey);
            }
            else
            {
                await HandleLocalSttAsync(webSocket, sttUrl);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling STT WebSocket");
            if (webSocket.State == WebSocketState.Open)
            {
                await webSocket.CloseAsync(WebSocketCloseStatus.InternalServerError, "STT processing error", CancellationToken.None);
            }
        }
    }

    private async Task HandleOpenAiSttAsync(WebSocket webSocket, string apiKey)
    {
        var config = _configurationService.GetConfiguration();
        var audioBuffer = new List<byte>();
        var model = config["OpenAI:WhisperModel"] ?? config["OPENAI_WHISPER_MODEL"] ?? "whisper-1";
        
        _logger.LogInformation("Starting OpenAI STT WebSocket session");
        
        try
        {
            var buffer = new byte[1024 * 16]; // Larger buffer for audio
            
            while (webSocket.State == WebSocketState.Open)
            {
                var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                    break;
                }
                
                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    _logger.LogDebug("Received STT control message: {Message}", message);
                    
                    // Handle control messages (e.g., "END" to process accumulated audio)
                    if (message.Trim().Equals("END", StringComparison.OrdinalIgnoreCase) && audioBuffer.Count > 0)
                    {
                        await ProcessAccumulatedAudio(webSocket, audioBuffer.ToArray(), model, apiKey);
                        audioBuffer.Clear();
                    }
                    else if (message.Trim().Equals("CLEAR", StringComparison.OrdinalIgnoreCase))
                    {
                        audioBuffer.Clear();
                        await SendWebSocketMessage(webSocket, "CLEARED");
                    }
                }
                else if (result.MessageType == WebSocketMessageType.Binary)
                {
                    // Accumulate audio data
                    var audioChunk = new byte[result.Count];
                    Array.Copy(buffer, audioChunk, result.Count);
                    audioBuffer.AddRange(audioChunk);
                    
                    _logger.LogDebug("Accumulated audio chunk: {ChunkSize} bytes, Total: {TotalSize} bytes", 
                        audioChunk.Length, audioBuffer.Count);
                }
            }
        }
        catch (WebSocketException ex)
        {
            _logger.LogWarning(ex, "WebSocket connection closed unexpectedly");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in OpenAI STT WebSocket handling");
            await SendWebSocketMessage(webSocket, $"ERROR: {ex.Message}");
        }
    }

    private async Task ProcessAccumulatedAudio(WebSocket webSocket, byte[] audioData, string model, string apiKey)
    {
        try
        {
            if (audioData.Length < 1024) // Skip very small audio chunks
            {
                await SendWebSocketMessage(webSocket, "ERROR: Audio too short");
                return;
            }

            _logger.LogInformation("Processing accumulated audio: {Size} bytes", audioData.Length);

            // Send to OpenAI Whisper
            using var form = new MultipartFormDataContent();
            form.Add(new ByteArrayContent(audioData), "file", "audio.wav");
            form.Add(new StringContent(model), "model");
            form.Add(new StringContent("json"), "response_format");

            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/transcriptions");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            request.Content = form;

            var response = await _httpClient.SendAsync(request);
            
            if (response.IsSuccessStatusCode)
            {
                var responseContent = await response.Content.ReadAsStringAsync();
                var transcription = JsonSerializer.Deserialize<JsonElement>(responseContent);
                var text = transcription.GetProperty("text").GetString() ?? "";

                if (!string.IsNullOrWhiteSpace(text))
                {
                    _logger.LogInformation("STT transcription successful: {Text}", text);
                    await SendWebSocketMessage(webSocket, text);
                }
                else
                {
                    await SendWebSocketMessage(webSocket, "");
                }
            }
            else
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError("OpenAI STT request failed: {StatusCode} - {Error}", response.StatusCode, errorContent);
                await SendWebSocketMessage(webSocket, $"ERROR: STT failed with status {response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing accumulated audio");
            await SendWebSocketMessage(webSocket, $"ERROR: {ex.Message}");
        }
    }

    private async Task SendWebSocketMessage(WebSocket webSocket, string message)
    {
        if (webSocket.State == WebSocketState.Open)
        {
            var bytes = Encoding.UTF8.GetBytes(message);
            await webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }

    private async Task HandleLocalSttAsync(WebSocket webSocket, string sttUrl)
    {
        // Simple echo for local STT (placeholder implementation)
        var buffer = new byte[1024 * 4];
        var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
        
        if (result.MessageType == WebSocketMessageType.Text)
        {
            var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
            _logger.LogInformation("Received STT message: {Message}", message);
            
            // Echo back for now
            var responseBytes = Encoding.UTF8.GetBytes($"Echo: {message}");
            await webSocket.SendAsync(new ArraySegment<byte>(responseBytes), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }

    public async Task<byte[]> GenerateTtsAsync(string text)
    {
        var config = _configurationService.GetConfiguration();
        
        try
        {
            var ttsUrlRaw = config["Voice:TtsUrl"] ?? config["TTS_URL"]; // allow empty to mean "no local TTS"
            
            var ttsProvider = config["Voice:TtsProvider"] ?? config["TTS_PROVIDER"] ?? string.Empty;
            var apiKey = config["OpenAI:ApiKey"] ?? config["OPENAI_API_KEY"];

            if (ttsProvider.ToLowerInvariant() == "openai" && !string.IsNullOrEmpty(apiKey))
            {
                return await GenerateOpenAiTtsAsync(text, apiKey);
            }
            else if (!string.IsNullOrEmpty(ttsUrlRaw))
            {
                return await GenerateLocalTtsAsync(text, ttsUrlRaw);
            }
            else
            {
                _logger.LogWarning("No TTS provider configured");
                return Array.Empty<byte>();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating TTS for text: {Text}", text);
            return Array.Empty<byte>();
        }
    }

    private async Task<byte[]> GenerateOpenAiTtsAsync(string text, string apiKey)
    {
        var config = _configurationService.GetConfiguration();
        
        // Use the latest OpenAI TTS model for better real-time performance
        var model = config["OpenAI:TtsModel"] ?? config["OPENAI_TTS_MODEL"] ?? "tts-1-hd";
        var voice = config["OpenAI:TtsVoice"] ?? config["OPENAI_TTS_VOICE"] ?? "alloy";
        var format = config["OpenAI:TtsFormat"] ?? config["OPENAI_TTS_FORMAT"] ?? "mp3";

        var requestData = new
        {
            model = model,
            input = text,
            voice = voice,
            response_format = format,
            speed = 1.0
        };

        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/speech");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(requestData), Encoding.UTF8, "application/json");

        try
        {
            var response = await _httpClient.SendAsync(request);
            
            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadAsByteArrayAsync();
            }
            else
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError("OpenAI TTS request failed: {StatusCode} - {Error}", response.StatusCode, errorContent);
                return Array.Empty<byte>();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception during OpenAI TTS request");
            return Array.Empty<byte>();
        }
    }

    private async Task<byte[]> GenerateLocalTtsAsync(string text, string ttsUrl)
    {
        var config = _configurationService.GetConfiguration();
        
        var model = config["OpenAI:TtsModel"] ?? config["OPENAI_TTS_MODEL"] ?? "tts-1";
        var voice = config["OpenAI:TtsVoice"] ?? config["OPENAI_TTS_VOICE"] ?? "alloy";

        var requestData = new
        {
            text = text,
            model = model,
            voice = voice
        };

        var request = new HttpRequestMessage(HttpMethod.Post, $"{ttsUrl}/v1/audio/speech");
        request.Content = new StringContent(JsonSerializer.Serialize(requestData), Encoding.UTF8, "application/json");

        var response = await _httpClient.SendAsync(request);
        
        if (response.IsSuccessStatusCode)
        {
            return await response.Content.ReadAsByteArrayAsync();
        }
        else
        {
            _logger.LogError("Local TTS request failed: {StatusCode}", response.StatusCode);
            return Array.Empty<byte>();
        }
    }
}
