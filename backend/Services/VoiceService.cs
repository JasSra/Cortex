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
        
        // Process audio data and send to OpenAI Whisper API
        var buffer = new byte[1024 * 4];
        var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

        if (result.MessageType == WebSocketMessageType.Binary)
        {
            var audioData = new byte[result.Count];
            Array.Copy(buffer, audioData, result.Count);

            // Send to OpenAI Whisper
            using var form = new MultipartFormDataContent();
            form.Add(new ByteArrayContent(audioData), "file", "audio.wav");
            form.Add(new StringContent(config["OpenAI:WhisperModel"] ?? config["OPENAI_WHISPER_MODEL"] ?? "whisper-1"), "model");

            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/transcriptions");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            request.Content = form;

            var response = await _httpClient.SendAsync(request);
            
            if (response.IsSuccessStatusCode)
            {
                var responseContent = await response.Content.ReadAsStringAsync();
                var transcription = JsonSerializer.Deserialize<JsonElement>(responseContent);
                var text = transcription.GetProperty("text").GetString() ?? "";

                var resultBytes = Encoding.UTF8.GetBytes(text);
                await webSocket.SendAsync(new ArraySegment<byte>(resultBytes), WebSocketMessageType.Text, true, CancellationToken.None);
            }
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
        
        var model = config["OpenAI:TtsModel"] ?? config["OPENAI_TTS_MODEL"] ?? "tts-1";
        var voice = config["OpenAI:TtsVoice"] ?? config["OPENAI_TTS_VOICE"] ?? "alloy";

        var requestData = new
        {
            model = model,
            input = text,
            voice = voice
        };

        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/speech");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(requestData), Encoding.UTF8, "application/json");

        var response = await _httpClient.SendAsync(request);
        
        if (response.IsSuccessStatusCode)
        {
            return await response.Content.ReadAsByteArrayAsync();
        }
        else
        {
            _logger.LogError("OpenAI TTS request failed: {StatusCode}", response.StatusCode);
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
