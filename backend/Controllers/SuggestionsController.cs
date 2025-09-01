using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Services.Providers;
using CortexApi.Security;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SuggestionsController : ControllerBase
{
    private readonly ISuggestionsService _suggestionsService;
    private readonly ILogger<SuggestionsController> _logger;
    private readonly IUserContextAccessor _userContext;

    public SuggestionsController(
        ISuggestionsService suggestionsService,
        ILogger<SuggestionsController> logger,
        IUserContextAccessor userContext)
    {
        _suggestionsService = suggestionsService;
        _logger = logger;
        _userContext = userContext;
    }

    /// <summary>
    /// Get daily digest for today or specified date
    /// </summary>
    [HttpGet("digest/today")]
    public async Task<ActionResult<DailyDigest>> GetTodaysDigest()
    {
        return await GetDailyDigest(DateTime.Today);
    }

    /// <summary>
    /// Get daily digest for a specific date
    /// </summary>
    [HttpGet("digest/{date:datetime}")]
    public async Task<ActionResult<DailyDigest>> GetDailyDigest(DateTime date)
    {
        try
        {
            _logger.LogInformation("Generating daily digest for {Date} for user {UserId}", 
                date.ToString("yyyy-MM-dd"), _userContext.UserId);

            // This would use _suggestionsService to generate digest
            // For now, return a placeholder
            var digest = new DailyDigest
            {
                Date = date,
                Summary = "Daily digest functionality coming soon",
                KeyInsights = new List<string>(),
                RecommendedActions = new List<string>(),
                ActivityCount = 0
            };

            return Ok(digest);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate daily digest for {Date}", date);
            return StatusCode(500, new { error = "Failed to generate digest" });
        }
    }

    /// <summary>
    /// Get note title suggestion using the suggestions service
    /// </summary>
    [HttpPost("note-title")]
    public async Task<ActionResult<string>> SuggestNoteTitle([FromBody] NoteTitleRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Content))
            {
                return BadRequest(new { error = "Content is required" });
            }

            var suggestion = await _suggestionsService.SuggestNoteTitleAsync(request.Content);
            
            if (string.IsNullOrEmpty(suggestion))
            {
                return StatusCode(500, new { error = "Failed to generate title suggestion" });
            }

            return Ok(new { title = suggestion });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to suggest note title");
            return StatusCode(500, new { error = "Failed to generate title suggestion" });
        }
    }

    /// <summary>
    /// Get entity insights for the current user
    /// </summary>
    [HttpGet("entities/insights")]
    public async Task<ActionResult<EntityInsights>> GetEntityInsights()
    {
        try
        {
            // This would use graph service and suggestions service
            // For now, return placeholder
            var insights = new EntityInsights
            {
                TopEntities = new List<string>(),
                RecentConnections = new List<string>(),
                SuggestedExplorations = new List<string>()
            };

            return Ok(insights);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get entity insights for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to get entity insights" });
        }
    }
}

// Request/Response models
public class NoteTitleRequest
{
    public string Content { get; set; } = string.Empty;
}

public class DailyDigest
{
    public DateTime Date { get; set; }
    public string Summary { get; set; } = string.Empty;
    public List<string> KeyInsights { get; set; } = new();
    public List<string> RecommendedActions { get; set; } = new();
    public int ActivityCount { get; set; }
}

public class EntityInsights
{
    public List<string> TopEntities { get; set; } = new();
    public List<string> RecentConnections { get; set; } = new();
    public List<string> SuggestedExplorations { get; set; } = new();
}
