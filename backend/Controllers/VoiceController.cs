using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CortexApi.Services;
using CortexApi.Security;

namespace CortexApi.Controllers;

/// <summary>
/// Voice operations - Speech-to-Text and Text-to-Speech
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class VoiceController : ControllerBase
{
    private readonly IVoiceService _voiceService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<VoiceController> _logger;

    public VoiceController(
        IVoiceService voiceService,
        IUserContextAccessor userContext,
        ILogger<VoiceController> logger)
    {
        _voiceService = voiceService;
        _userContext = userContext;
        _logger = logger;
    }

    /// <summary>
    /// WebSocket endpoint for Speech-to-Text streaming
    /// Note: This should be mapped separately in Program.cs due to WebSocket requirements
    /// </summary>
    [HttpGet("stt")]
    public async Task<IActionResult> HandleSttWebSocket()
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        if (!HttpContext.WebSockets.IsWebSocketRequest)
            return BadRequest("WebSocket connection required");

        _logger.LogInformation("Starting STT WebSocket session for user {UserId}", _userContext.UserId);

        try
        {
            var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();
            await _voiceService.HandleSttWebSocketAsync(webSocket);
            return new EmptyResult();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in STT WebSocket for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "WebSocket error" });
        }
    }

    /// <summary>
    /// Convert text to speech (Reader role required)
    /// </summary>
    [HttpPost("tts")]
    public async Task<IActionResult> TextToSpeech([FromBody] VoiceTtsRequest request)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        if (string.IsNullOrWhiteSpace(request.Text))
            return BadRequest("Text is required");

        if (request.Text.Length > 5000) // Reasonable limit
            return BadRequest("Text too long (max 5000 characters)");

        _logger.LogInformation("TTS request for user {UserId}, text length: {Length}", 
            _userContext.UserId, request.Text.Length);

        try
        {
            var audioData = await _voiceService.GenerateTtsAsync(request.Text);
            
            _logger.LogInformation("TTS completed for user {UserId}, audio size: {Size} bytes", 
                _userContext.UserId, audioData.Length);

            return File(audioData, "audio/wav", "tts-output.wav");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "TTS error for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to generate speech", details = ex.Message });
        }
    }

    /// <summary>
    /// Stream text-to-speech audio progressively. Accepts query params: text, optional format.
    /// Also supports access_token on query for media element compatibility.
    /// </summary>
    [HttpGet("tts/stream")]
    public async Task<IActionResult> StreamTextToSpeech([FromQuery] string text, [FromQuery] string? format = null)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        if (string.IsNullOrWhiteSpace(text))
            return BadRequest("Text is required");

        _logger.LogInformation("TTS stream request for user {UserId}, text length: {Length}", _userContext.UserId, text.Length);

        try
        {
            // Generate full audio (service does not support real streaming yet)
            var audioData = await _voiceService.GenerateTtsAsync(text);
            var contentType = string.Equals(format, "mp3", StringComparison.OrdinalIgnoreCase) ? "audio/mpeg" : "audio/wav";

            // Write in chunks to enable progressive playback
            Response.StatusCode = 200;
            Response.ContentType = contentType;
            const int chunk = 16 * 1024;
            int offset = 0;
            while (offset < audioData.Length)
            {
                int len = Math.Min(chunk, audioData.Length - offset);
                await Response.Body.WriteAsync(audioData, offset, len);
                offset += len;
                await Response.Body.FlushAsync();
            }
            return new EmptyResult();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Streaming TTS error for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to stream speech", details = ex.Message });
        }
    }

    /// <summary>
    /// Play a server-generated TTS sample (Reader role required)
    /// </summary>
    [HttpPost("test")]
    public async Task<IActionResult> PlayTestTts([FromBody] VoiceTestRequest? request = null)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        var testText = request?.Text ?? "Hello! This is a test of the text-to-speech system. If you can hear this clearly, your voice configuration is working properly.";

        _logger.LogInformation("TTS test request for user {UserId}", _userContext.UserId);

        try
        {
            var audioData = await _voiceService.GenerateTtsAsync(testText);
            
            _logger.LogInformation("TTS test completed for user {UserId}, audio size: {Size} bytes", 
                _userContext.UserId, audioData.Length);

            return File(audioData, "audio/wav", "tts-test.wav");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "TTS test error for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to generate test speech", details = ex.Message });
        }
    }

    /// <summary>
    /// Validate and apply voice configuration (Reader role required)
    /// </summary>
    [HttpPost("config")]
    public async Task<IActionResult> ValidateVoiceConfig([FromBody] VoiceConfigRequest request)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        _logger.LogInformation("Voice config validation for user {UserId}", _userContext.UserId);

        try
        {
            var result = await _voiceService.ValidateVoiceConfigAsync(request);
            
            if (result.IsValid)
            {
                _logger.LogInformation("Voice config validated successfully for user {UserId}", _userContext.UserId);
                return Ok(result);
            }
            else
            {
                _logger.LogWarning("Voice config validation failed for user {UserId}: {Errors}", 
                    _userContext.UserId, string.Join(", ", result.Errors));
                return BadRequest(result);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Voice config validation error for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to validate voice configuration", details = ex.Message });
        }
    }
}

/// <summary>
/// Request model for Text-to-Speech
/// </summary>
public record VoiceTtsRequest(string Text);

/// <summary>
/// Request model for TTS test
/// </summary>
public record VoiceTestRequest(string? Text = null);

/// <summary>
/// Request model for voice configuration validation
/// </summary>
public record VoiceConfigRequest(
    string? VoiceLanguage = null,
    double? VoiceSpeed = null,
    double? VoiceVolume = null,
    double? MicrophoneSensitivity = null,
    bool? ContinuousListening = null,
    string? WakeWord = null
);

/// <summary>
/// Response model for voice configuration validation
/// </summary>
public class VoiceConfigValidationResult
{
    public bool IsValid { get; set; }
    public List<string> Errors { get; set; } = new();
    public List<string> Warnings { get; set; } = new();
    public VoiceConfigRequest? ValidatedConfig { get; set; }
}
