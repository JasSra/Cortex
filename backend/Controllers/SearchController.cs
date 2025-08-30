using Microsoft.AspNetCore.Mvc;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Controllers;

/// <summary>
/// Search operations - user-scoped queries with hybrid search
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class SearchController : ControllerBase
{
    private readonly ISearchService _searchService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<SearchController> _logger;
    private readonly IGamificationService _gamificationService;
    private readonly CortexApi.Data.CortexDbContext _db;

    public SearchController(
        ISearchService searchService,
        IUserContextAccessor userContext,
        ILogger<SearchController> logger,
    IGamificationService gamificationService,
    CortexApi.Data.CortexDbContext db)
    {
        _searchService = searchService;
        _userContext = userContext;
        _logger = logger;
    _gamificationService = gamificationService;
    _db = db;
    }

    /// <summary>
    /// Search notes using hybrid (semantic + BM25) approach
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Search([FromBody] SearchRequest request)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        if (string.IsNullOrWhiteSpace(request.Q))
            return BadRequest("Query 'q' is required");

        _logger.LogInformation("Search query '{Query}' for user {UserId} (mode: {Mode}, k: {K})", 
            request.Q, _userContext.UserId, request.Mode, request.K);

        // Ensure user ID is set for scoped search
        var response = await _searchService.SearchHybridAsync(request, _userContext.UserId);

        // Track search activity for gamification
        var subjectId = _userContext.UserSubjectId ?? _userContext.UserId;
        var userProfileId = await _db.UserProfiles
            .Where(up => up.SubjectId == subjectId)
            .Select(up => up.Id)
            .FirstOrDefaultAsync();
        if (!string.IsNullOrEmpty(userProfileId))
        {
            await _gamificationService.UpdateUserStatsAsync(userProfileId, "search_performed");
            await _gamificationService.CheckAndAwardAchievementsAsync(userProfileId, "search_performed");
        }

        _logger.LogInformation("Search returned {HitCount} results for user {UserId}", 
            response.Hits.Count, _userContext.UserId);

        return Ok(response);
    }

    /// <summary>
    /// Simple GET-based search for compatibility
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> SearchGet(
        [FromQuery] string q = "",
        [FromQuery] int k = 10,
        [FromQuery] string mode = "hybrid",
        [FromQuery] double alpha = 0.6)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        if (string.IsNullOrWhiteSpace(q))
            return BadRequest("Query parameter 'q' is required");

        var request = new SearchRequest 
        { 
            Q = q, 
            K = k, 
            Mode = mode, 
            Alpha = alpha 
        };

        _logger.LogInformation("GET search query '{Query}' for user {UserId}", q, _userContext.UserId);

        var response = await _searchService.SearchHybridAsync(request, _userContext.UserId);
        
        // Track search activity for gamification
        var subjectId = _userContext.UserSubjectId ?? _userContext.UserId;
        var userProfileId = await _db.UserProfiles
            .Where(up => up.SubjectId == subjectId)
            .Select(up => up.Id)
            .FirstOrDefaultAsync();
        if (!string.IsNullOrEmpty(userProfileId))
        {
            await _gamificationService.UpdateUserStatsAsync(userProfileId, "search_performed");
            await _gamificationService.CheckAndAwardAchievementsAsync(userProfileId, "search_performed");
        }
        
        return Ok(response);
    }

    /// <summary>
    /// Advanced search with Stage 2 auto-classification filtering
    /// </summary>
    [HttpPost("advanced")]
    public async Task<IActionResult> SearchAdvanced([FromBody] AdvancedSearchRequest request)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        if (string.IsNullOrWhiteSpace(request.Q))
            return BadRequest("Query 'Q' is required");

        _logger.LogInformation("Advanced search query '{Query}' for user {UserId} (mode: {Mode}, k: {K}, sensitivity: {SensitivityLevels}, excludePii: {ExcludePii}, excludeSecrets: {ExcludeSecrets})", 
            request.Q, _userContext.UserId, request.Mode, request.K, 
            request.SensitivityLevels?.Any() == true ? string.Join(",", request.SensitivityLevels) : "none",
            request.ExcludePii, request.ExcludeSecrets);

        // Ensure user ID is set for scoped search
        var response = await _searchService.SearchAdvancedAsync(request, _userContext.UserId);

        // Track search activity for gamification
        var subjectId = _userContext.UserSubjectId ?? _userContext.UserId;
        var userProfileId = await _db.UserProfiles
            .Where(up => up.SubjectId == subjectId)
            .Select(up => up.Id)
            .FirstOrDefaultAsync();
        if (!string.IsNullOrEmpty(userProfileId))
        {
            await _gamificationService.UpdateUserStatsAsync(userProfileId, "search_performed");
            await _gamificationService.CheckAndAwardAchievementsAsync(userProfileId, "search_performed");
        }

        _logger.LogInformation("Advanced search returned {HitCount} results for user {UserId}", 
            response.Hits.Count, _userContext.UserId);

        return Ok(response);
    }
}
