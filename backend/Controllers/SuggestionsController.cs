using Microsoft.AspNetCore.Mvc;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
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

            var digest = await _suggestionsService.GenerateDailyDigestAsync(date);
            
            _logger.LogInformation("Daily digest generated with {InsightCount} insights and {SuggestionCount} suggestions", 
                digest.KeyInsights.Count, digest.ProactiveSuggestions.Count);
                
            return Ok(digest);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating daily digest for {Date} for user {UserId}", 
                date.ToString("yyyy-MM-dd"), _userContext.UserId);
            return StatusCode(500, new { error = "Failed to generate daily digest" });
        }
    }

    /// <summary>
    /// Get proactive suggestions for the user
    /// </summary>
    [HttpGet("proactive")]
    public async Task<ActionResult<List<ProactiveSuggestion>>> GetProactiveSuggestions(
        [FromQuery] int limit = 5)
    {
        try
        {
            _logger.LogInformation("Getting proactive suggestions for user {UserId}, limit: {Limit}", 
                _userContext.UserId, limit);

            var suggestions = await _suggestionsService.GetProactiveSuggestionsAsync(limit);
            
            return Ok(suggestions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting proactive suggestions for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to get suggestions" });
        }
    }

    /// <summary>
    /// Get trending topics based on recent activity
    /// </summary>
    [HttpGet("trending")]
    public async Task<ActionResult<List<string>>> GetTrendingTopics(
        [FromQuery] int days = 7,
        [FromQuery] int limit = 10)
    {
        try
        {
            _logger.LogInformation("Getting trending topics for user {UserId}, days: {Days}, limit: {Limit}", 
                _userContext.UserId, days, limit);

            var topics = await _suggestionsService.GetTrendingTopicsAsync(days, limit);
            
            return Ok(topics);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting trending topics for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to get trending topics" });
        }
    }

    /// <summary>
    /// Get entity insights and statistics
    /// </summary>
    [HttpGet("entities/insights")]
    public async Task<ActionResult<List<EntityInsight>>> GetEntityInsights(
        [FromQuery] string? entityType = null)
    {
        try
        {
            _logger.LogInformation("Getting entity insights for user {UserId}, type: {EntityType}", 
                _userContext.UserId, entityType ?? "all");

            var insights = await _suggestionsService.GetEntityInsightsAsync(entityType);
            
            return Ok(insights);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting entity insights for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to get entity insights" });
        }
    }
}
