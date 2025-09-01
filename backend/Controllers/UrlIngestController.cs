using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;
using System.ComponentModel.DataAnnotations;

namespace CortexApi.Controllers;

/// <summary>
/// Advanced URL ingestion operations with specialized handlers
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UrlIngestController : ControllerBase
{
    private readonly IUrlIngestService _urlIngestService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<UrlIngestController> _logger;

    public UrlIngestController(
        IUrlIngestService urlIngestService,
        IUserContextAccessor userContext,
        ILogger<UrlIngestController> logger)
    {
        _urlIngestService = urlIngestService;
        _userContext = userContext;
        _logger = logger;
    }

    private bool EnsureAuthenticated()
    {
        // Allow any authenticated user; in Development also allow unauthenticated for local testing
        if (_userContext.IsAuthenticated) return true;
        if (HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment())
        {
            return true;
        }
        return false;
    }

    /// <summary>
    /// Download and ingest PDF from URL
    /// </summary>
    [HttpPost("pdf")]
    public async Task<IActionResult> IngestPdfFromUrl([FromBody] PdfUrlIngestRequest request)
    {
        if (!EnsureAuthenticated())
            return Forbid();

        if (string.IsNullOrWhiteSpace(request.Url))
            return BadRequest("URL is required");

        _logger.LogInformation("Ingesting PDF from URL {Url} for user {UserId}", 
            request.Url, _userContext.UserId);

        try
        {
            var result = await _urlIngestService.IngestPdfFromUrlAsync(request.Url, request.Title);
            
            if (result == null)
            {
                return StatusCode(500, new { error = "Failed to process PDF" });
            }
            
            _logger.LogInformation("Successfully ingested PDF from URL {Url} for user {UserId}", 
                request.Url, _userContext.UserId);

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ingesting PDF from URL {Url} for user {UserId}", 
                request.Url, _userContext.UserId);
            return StatusCode(500, new { error = "Failed to ingest PDF", details = ex.Message });
        }
    }

    /// <summary>
    /// Process multiple URLs from a list (e.g., extracted from Hacker News)
    /// </summary>
    [HttpPost("batch")]
    public async Task<IActionResult> IngestUrlBatch([FromBody] BatchUrlIngestRequest request)
    {
        if (!EnsureAuthenticated())
            return Forbid();

        if (request.Urls == null || request.Urls.Count == 0)
            return BadRequest("At least one URL is required");

        if (request.Urls.Count > 20)
            return BadRequest("Maximum 20 URLs allowed per batch");

        _logger.LogInformation("Ingesting batch of {Count} URLs for user {UserId}", 
            request.Urls.Count, _userContext.UserId);

        try
        {
            var results = await _urlIngestService.IngestUrlBatchAsync(request.Urls, request.MaxConcurrent ?? 3);
            
            var successCount = results.Count(r => r.Status == "success");
            _logger.LogInformation("Successfully ingested {Success}/{Total} URLs for user {UserId}", 
                successCount, request.Urls.Count, _userContext.UserId);

            return Ok(results);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ingesting URL batch for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to ingest URL batch", details = ex.Message });
        }
    }
}

/// <summary>
/// Request model for PDF URL ingestion
/// </summary>
public class PdfUrlIngestRequest
{
    [Required]
    public string Url { get; set; } = string.Empty;
    public string? Title { get; set; }
}

/// <summary>
/// Request model for batch URL ingestion
/// </summary>
public class BatchUrlIngestRequest
{
    [Required]
    public List<string> Urls { get; set; } = new();
    public int? MaxConcurrent { get; set; } = 3;
}
