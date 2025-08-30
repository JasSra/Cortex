using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Net.Http.Headers;
using CortexApi.Controllers;

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
    private readonly IConfiguration _configuration;
    private readonly ILogger<VoiceService> _logger;

    // Supported voice languages
    private readonly HashSet<string> _supportedLanguages = new()
    {
        "en-US", "en-GB", "en-AU", "en-CA", "en-IN",
        "es-ES", "es-MX", "fr-FR", "fr-CA", "de-DE",
        "it-IT", "pt-BR", "pt-PT", "ja-JP", "ko-KR",
        "zh-CN", "zh-TW", "ru-RU", "ar-SA", "hi-IN"
    };

    // Supported wake words
    private readonly HashSet<string> _supportedWakeWords = new()
    {
        "Hey Cortex", "Cortex", "Computer", "Assistant",
        "Hello Cortex", "Voice Assistant"
    };

    public VoiceService(HttpClient httpClient, IConfiguration configuration, ILogger<VoiceService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
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
                warnings.Add("Voice speed outside recommended range (0.5 - 2.0) may affect quality");
            }
        }

        // Validate voice volume
        if (request.VoiceVolume.HasValue)
        {
            if (request.VoiceVolume < 0.0 || request.VoiceVolume > 1.0)
            {
                errors.Add("Voice volume must be between 0.0 and 1.0");
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
            
            if (request.WakeWord.Length > 50)
            {
                errors.Add("Wake word must not exceed 50 characters");
            }
        }

        // Test TTS availability if applicable
        if (!string.IsNullOrEmpty(request.VoiceLanguage))
        {
            try
            {
                var testText = "Test";
                var audioData = await GenerateTtsAsync(testText);
                if (audioData.Length == 0)
                {
                    warnings.Add("TTS service may not be available or configured properly");
                }
            }
            catch (Exception ex)
            {
                warnings.Add($"TTS test failed: {ex.Message}");
            }
        }

        result.IsValid = errors.Count == 0;
        result.Errors = errors;
        result.Warnings = warnings;
        result.ValidatedConfig = request;

        return result;
    }

    public async Task HandleSttWebSocketAsync(WebSocket webSocket)
    {
    // STT config: prefer structured keys then env fallbacks
    var sttUrl = _configuration["Voice:SttUrl"] ?? _configuration["STT_URL"] ?? "http://localhost:8001";
        var buffer = new byte[1024 * 4];

        try
        {
            // If configured to use OpenAI for STT, buffer audio and transcribe on close
            var sttProvider = _configuration["Voice:SttProvider"] ?? _configuration["STT_PROVIDER"] ?? string.Empty;
            var openAiKey = _configuration["OpenAI:ApiKey"] ?? _configuration["OPENAI_API_KEY"];
            if (string.IsNullOrWhiteSpace(sttUrl) || sttProvider.Equals("openai", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(openAiKey))
                {
                    throw new InvalidOperationException("OpenAI API key not configured for STT");
                }

                using var audioBuffer = new MemoryStream();

                // Receive binary audio from client and buffer
                while (webSocket.State == WebSocketState.Open)
                {
                    var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                    if (result.MessageType == WebSocketMessageType.Binary)
                    {
                        await audioBuffer.WriteAsync(buffer, 0, result.Count, CancellationToken.None);
                    }
                    else if (result.MessageType == WebSocketMessageType.Text)
                    {
                        // Accept a small control message to indicate end of audio without closing the socket
                        var textMsg = Encoding.UTF8.GetString(buffer, 0, result.Count).Trim().ToLowerInvariant();
                        if (textMsg is "end" or "eof" or "done")
                        {
                            break;
                        }
                    }
                    else if (result.MessageType == WebSocketMessageType.Close)
                    {
                        break;
                    }
                }

                // Transcribe with OpenAI Whisper
                audioBuffer.Position = 0;
                // Inspect first 4 bytes to detect WAV (RIFF) vs default to WEBM
                var header = new byte[4];
                int read = await audioBuffer.ReadAsync(header, 0, 4, CancellationToken.None);
                bool isWav = read == 4 && header[0] == (byte)'R' && header[1] == (byte)'I' && header[2] == (byte)'F' && header[3] == (byte)'F';
                audioBuffer.Position = 0;

                using var form = new MultipartFormDataContent();
                var streamContent = new StreamContent(audioBuffer);
                streamContent.Headers.ContentType = new MediaTypeHeaderValue(isWav ? "audio/wav" : "audio/webm");
                form.Add(streamContent, "file", isWav ? "audio.wav" : "audio.webm");
                form.Add(new StringContent(_configuration["OpenAI:WhisperModel"] ?? _configuration["OPENAI_WHISPER_MODEL"] ?? "whisper-1"), "model");

                using var http = new HttpClient();
                http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", openAiKey);
                using var response = await http.PostAsync("https://api.openai.com/v1/audio/transcriptions", form);
                response.EnsureSuccessStatusCode();
                var respJson = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(respJson);
                var text = doc.RootElement.TryGetProperty("text", out var t) ? t.GetString() ?? string.Empty : string.Empty;

                if (!string.IsNullOrWhiteSpace(text))
                {
                    var message = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { text }));
                    if (webSocket.State == WebSocketState.Open)
                    {
                        await webSocket.SendAsync(new ArraySegment<byte>(message), WebSocketMessageType.Text, true, CancellationToken.None);
                    }
                }

                if (webSocket.State == WebSocketState.Open)
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
                }
                return;
            }

            // Create WebSocket connection to STT service with simple fallbacks
            using var clientWebSocket = new ClientWebSocket();
            var wsBase = sttUrl.Replace("http://", "ws://").Replace("https://", "wss://");
            var tried = new List<string>();

            async Task<bool> TryConnectAsync(string candidate)
            {
                try
                {
                    tried.Add(candidate);
                    await clientWebSocket.ConnectAsync(new Uri(candidate), CancellationToken.None);
                    return true;
                }
                catch
                {
                    return false;
                }
            }

            var connected =
                await TryConnectAsync($"{wsBase}/ws") ||
                await TryConnectAsync(wsBase) ||
                await TryConnectAsync($"{wsBase}/");

            if (!connected)
            {
                throw new InvalidOperationException($"Unable to connect to STT WebSocket. Tried: {string.Join(", ", tried)}");
            }

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
            var ttsUrlRaw = _configuration["Voice:TtsUrl"] ?? _configuration["TTS_URL"]; // allow empty to mean "no local TTS"
            var ttsUrl = string.IsNullOrWhiteSpace(ttsUrlRaw) ? null : ttsUrlRaw;
            var ttsProvider = _configuration["Voice:TtsProvider"] ?? _configuration["TTS_PROVIDER"] ?? string.Empty;
            var apiKey = _configuration["OpenAI:ApiKey"] ?? _configuration["OPENAI_API_KEY"];

            // If explicitly using OpenAI or no local TTS URL is provided, go straight to OpenAI
            var preferOpenAi = ttsProvider.Equals("openai", StringComparison.OrdinalIgnoreCase) || ttsUrl is null;
            if (preferOpenAi)
            {
                if (string.IsNullOrWhiteSpace(apiKey))
                {
                    _logger.LogError("TTS_PROVIDER is 'openai' (or TTS_URL not set) but OPENAI_API_KEY is missing");
                    return Array.Empty<byte>();
                }

                var model = _configuration["OpenAI:TtsModel"] ?? _configuration["OPENAI_TTS_MODEL"] ?? "gpt-4o-mini-tts"; // or tts-1
                var voice = _configuration["OpenAI:TtsVoice"] ?? _configuration["OPENAI_TTS_VOICE"] ?? "alloy";
                var openaiPayload = new { model, input = text, voice, format = "wav" };
                var openaiJson = new StringContent(JsonSerializer.Serialize(openaiPayload), Encoding.UTF8, "application/json");
                _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
                using var resp = await _httpClient.PostAsync("https://api.openai.com/v1/audio/speech", openaiJson);
                resp.EnsureSuccessStatusCode();
                return await resp.Content.ReadAsByteArrayAsync();
            }

            // Otherwise, try local/network TTS first, then fall back to OpenAI if available
            ttsUrl ??= "http://localhost:8002";
            var requestData = new { text = text };
            var json = JsonSerializer.Serialize(requestData);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var endpoints = new[] { "/synthesize", "/api/tts", "/tts" };
            foreach (var ep in endpoints)
            {
                var url = $"{ttsUrl}{ep}";
                try
                {
                    using var response = await _httpClient.PostAsync(url, content);
                    if (response.IsSuccessStatusCode)
                    {
                        return await response.Content.ReadAsByteArrayAsync();
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "TTS request failed at {Url}", url);
                }
            }

            if (!string.IsNullOrWhiteSpace(apiKey))
            {
                var model = _configuration["OpenAI:TtsModel"] ?? _configuration["OPENAI_TTS_MODEL"] ?? "gpt-4o-mini-tts"; // or tts-1
                var voice = _configuration["OpenAI:TtsVoice"] ?? _configuration["OPENAI_TTS_VOICE"] ?? "alloy";
                var openaiPayload = new { model, input = text, voice, format = "wav" };
                var openaiJson = new StringContent(JsonSerializer.Serialize(openaiPayload), Encoding.UTF8, "application/json");
                _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
                using var resp = await _httpClient.PostAsync("https://api.openai.com/v1/audio/speech", openaiJson);
                resp.EnsureSuccessStatusCode();
                return await resp.Content.ReadAsByteArrayAsync();
            }

            _logger.LogError("All TTS endpoints failed at base URL {Base} and no OpenAI TTS fallback configured", ttsUrl);
            return Array.Empty<byte>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating TTS for text: {Text}", text);
            return Array.Empty<byte>();
        }
    }
}
