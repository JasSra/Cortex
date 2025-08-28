using Microsoft.AspNetCore.Mvc;
using CortexApi.Services;
using CortexApi.Security;

namespace CortexApi.Controllers;

/// <summary>
/// Voice operations - Speech-to-Text and Text-to-Speech
/// </summary>
[ApiController]
[Route("api/[controller]")]
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
}

/// <summary>
/// Request model for Text-to-Speech
/// </summary>
public record VoiceTtsRequest(string Text);
