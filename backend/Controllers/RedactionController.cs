using CortexApi.Models;
using CortexApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RedactionController : ControllerBase
{
    private readonly IRedactionService _redactionService;
    private readonly ILogger<RedactionController> _logger;

    public RedactionController(
        IRedactionService redactionService,
        ILogger<RedactionController> logger)
    {
        _redactionService = redactionService;
        _logger = logger;
    }

    /// <summary>
    /// Preview redacted content for a note based on sensitivity policy
    /// </summary>
    [HttpPost("preview")]
    public async Task<ActionResult<RedactionPreviewResponse>> PreviewRedaction(
        [FromBody] RedactionPreviewRequest request)
    {
        try
        {
            var result = await _redactionService.PreviewRedactionAsync(request.NoteId, request.Policy);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating redaction preview for note {NoteId}", request.NoteId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Verify voice PIN for accessing sensitive content
    /// </summary>
    [HttpPost("verify-pin")]
    public async Task<ActionResult<VoicePinVerificationResponse>> VerifyVoicePin(
        [FromBody] VoicePinVerificationRequest request)
    {
        try
        {
            var isValid = await _redactionService.VerifyVoicePinAsync(request.Pin, request.UserId ?? "default");
            
            return Ok(new VoicePinVerificationResponse
            {
                IsValid = isValid,
                Message = isValid ? "PIN verified successfully" : "Invalid PIN"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying voice PIN");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Set voice PIN for accessing sensitive content
    /// </summary>
    [HttpPost("set-pin")]
    public async Task<ActionResult<VoicePinSetResponse>> SetVoicePin(
        [FromBody] VoicePinSetRequest request)
    {
        try
        {
            // Basic PIN validation
            if (string.IsNullOrWhiteSpace(request.Pin))
            {
                return BadRequest(new { error = "PIN cannot be empty" });
            }

            if (request.Pin.Length < 4 || request.Pin.Length > 10)
            {
                return BadRequest(new { error = "PIN must be between 4 and 10 characters" });
            }

            await _redactionService.SetVoicePinAsync(request.Pin, request.UserId ?? "default");
            
            return Ok(new VoicePinSetResponse
            {
                Success = true,
                Message = "Voice PIN set successfully"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error setting voice PIN");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get redaction policy information for sensitivity levels
    /// </summary>
    [HttpGet("policy")]
    public ActionResult<RedactionPolicyResponse> GetRedactionPolicy()
    {
        var policies = new Dictionary<int, object>
        {
            { 0, new { level = "Public", maskPii = false, maskSecrets = false, requirePin = false, description = "No redaction required" } },
            { 1, new { level = "Internal", maskPii = false, maskSecrets = true, requirePin = false, description = "Secrets redacted" } },
            { 2, new { level = "Confidential", maskPii = true, maskSecrets = true, requirePin = true, description = "PII and secrets redacted, PIN required" } },
            { 3, new { level = "Secret", maskPii = true, maskSecrets = true, requirePin = true, description = "Full redaction, PIN required" } }
        };

        return Ok(new RedactionPolicyResponse
        {
            Policies = policies,
            DefaultPolicy = "default"
        });
    }
}

// Request/Response models for redaction endpoints
public record VoicePinVerificationRequest(string Pin, string? UserId = null);

public class VoicePinVerificationResponse
{
    public bool IsValid { get; set; }
    public string Message { get; set; } = string.Empty;
}

public record VoicePinSetRequest(string Pin, string? UserId = null);

public class VoicePinSetResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
}

public class RedactionPolicyResponse
{
    public Dictionary<int, object> Policies { get; set; } = new();
    public string DefaultPolicy { get; set; } = string.Empty;
}
