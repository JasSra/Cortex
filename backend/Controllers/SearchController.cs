using Microsoft.AspNetCore.Mvc;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;

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

    public SearchController(
        ISearchService searchService,
        IUserContextAccessor userContext,
        ILogger<SearchController> logger)
    {
        _searchService = searchService;
        _userContext = userContext;
        _logger = logger;
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
        return Ok(response);
    }
}
