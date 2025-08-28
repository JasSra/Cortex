using Microsoft.AspNetCore.Mvc;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GraphController : ControllerBase
{
    private readonly IGraphService _graphService;
    private readonly INerService _nerService;
    private readonly ILogger<GraphController> _logger;
    private readonly IUserContextAccessor _userContext;

    public GraphController(
        IGraphService graphService,
        INerService nerService,
        ILogger<GraphController> logger,
        IUserContextAccessor userContext)
    {
        _graphService = graphService;
        _nerService = nerService;
        _logger = logger;
        _userContext = userContext;
    }

    /// <summary>
    /// Get entity graph with optional focus and filtering
    /// </summary>
    /// <param name="focus">Focus entity in format "entity:ID"</param>
    /// <param name="depth">Graph traversal depth (default: 2)</param>
    /// <param name="entityTypes">Filter by entity types</param>
    /// <param name="fromDate">Filter entities from date</param>
    /// <param name="toDate">Filter entities to date</param>
    [HttpGet]
    public async Task<ActionResult<GraphResponse>> GetGraph(
        [FromQuery] string? focus = null,
        [FromQuery] int depth = 2,
        [FromQuery] string[]? entityTypes = null,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null)
    {
        try
        {
            _logger.LogInformation("Getting graph for user {UserId}, focus: {Focus}, depth: {Depth}", 
                _userContext.UserId, focus, depth);

            var request = new GraphRequest
            {
                Focus = focus,
                Depth = Math.Min(depth, 5), // Limit depth for performance
                EntityTypes = entityTypes?.ToList() ?? new List<string>(),
                FromDate = fromDate,
                ToDate = toDate
            };

            var response = await _graphService.GetGraphAsync(request);
            
            _logger.LogInformation("Retrieved graph with {NodeCount} nodes and {EdgeCount} edges", 
                response.Nodes.Count, response.Edges.Count);
                
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving graph for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to retrieve graph" });
        }
    }

    /// <summary>
    /// Get connected entities for a specific entity
    /// </summary>
    [HttpGet("entities/{entityId}/connected")]
    public async Task<ActionResult<List<GraphNode>>> GetConnectedEntities(
        string entityId,
        [FromQuery] int depth = 2)
    {
        try
        {
            _logger.LogInformation("Getting connected entities for {EntityId}, depth: {Depth}", 
                entityId, depth);

            var connectedEntities = await _graphService.GetConnectedEntitiesAsync(entityId, depth);
            
            return Ok(connectedEntities);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting connected entities for {EntityId}", entityId);
            return StatusCode(500, new { error = "Failed to get connected entities" });
        }
    }

    /// <summary>
    /// Get suggested related entities
    /// </summary>
    [HttpGet("entities/{entityId}/suggestions")]
    public async Task<ActionResult<List<string>>> GetEntitySuggestions(string entityId)
    {
        try
        {
            _logger.LogInformation("Getting entity suggestions for {EntityId}", entityId);

            var suggestions = await _graphService.SuggestRelatedEntitiesAsync(entityId);
            
            return Ok(suggestions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting entity suggestions for {EntityId}", entityId);
            return StatusCode(500, new { error = "Failed to get entity suggestions" });
        }
    }

    /// <summary>
    /// Get entity statistics by type
    /// </summary>
    [HttpGet("statistics")]
    public async Task<ActionResult<Dictionary<string, int>>> GetEntityStatistics()
    {
        try
        {
            _logger.LogInformation("Getting entity statistics for user {UserId}", _userContext.UserId);

            var stats = await _graphService.GetEntityStatisticsAsync();
            
            return Ok(stats);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting entity statistics for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to get entity statistics" });
        }
    }

    /// <summary>
    /// Extract entities from text (for testing/debugging)
    /// </summary>
    [HttpPost("extract")]
    public async Task<ActionResult<List<EntityExtraction>>> ExtractEntities([FromBody] string text)
    {
        try
        {
            _logger.LogInformation("Extracting entities from text for user {UserId}", _userContext.UserId);

            var extractions = await _nerService.ExtractEntitiesAsync(text);
            
            return Ok(extractions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error extracting entities for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to extract entities" });
        }
    }

    /// <summary>
    /// Discover co-occurrence relationships between entities
    /// </summary>
    [HttpPost("discover/co-occurrence")]
    public async Task<ActionResult> DiscoverCoOccurrenceRelationships()
    {
        try
        {
            _logger.LogInformation("Starting co-occurrence relationship discovery for user {UserId}", _userContext.UserId);
            var newRelationships = await _graphService.DiscoverCoOccurrenceRelationshipsAsync();
            
            return Ok(new { 
                discovered = newRelationships.Count,
                message = $"Discovered {newRelationships.Count} co-occurrence relationships"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error discovering co-occurrence relationships for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to discover co-occurrence relationships" });
        }
    }

    /// <summary>
    /// Discover semantic relationships based on entity similarity
    /// </summary>
    [HttpPost("discover/semantic")]
    public async Task<ActionResult> DiscoverSemanticRelationships()
    {
        try
        {
            _logger.LogInformation("Starting semantic relationship discovery for user {UserId}", _userContext.UserId);
            var newRelationships = await _graphService.DiscoverSemanticRelationshipsAsync();
            
            return Ok(new { 
                discovered = newRelationships.Count,
                message = $"Discovered {newRelationships.Count} semantic relationships"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error discovering semantic relationships for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to discover semantic relationships" });
        }
    }

    /// <summary>
    /// Discover temporal relationships based on creation patterns
    /// </summary>
    [HttpPost("discover/temporal")]
    public async Task<ActionResult> DiscoverTemporalRelationships()
    {
        try
        {
            _logger.LogInformation("Starting temporal relationship discovery for user {UserId}", _userContext.UserId);
            var newRelationships = await _graphService.DiscoverTemporalRelationshipsAsync();
            
            return Ok(new { 
                discovered = newRelationships.Count,
                message = $"Discovered {newRelationships.Count} temporal relationships"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error discovering temporal relationships for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to discover temporal relationships" });
        }
    }

    /// <summary>
    /// Run all relationship discovery algorithms
    /// </summary>
    [HttpPost("discover/all")]
    public async Task<ActionResult> DiscoverAllRelationships()
    {
        try
        {
            _logger.LogInformation("Starting comprehensive relationship discovery for user {UserId}", _userContext.UserId);
            
            var coOccurrenceTask = _graphService.DiscoverCoOccurrenceRelationshipsAsync();
            var semanticTask = _graphService.DiscoverSemanticRelationshipsAsync();
            var temporalTask = _graphService.DiscoverTemporalRelationshipsAsync();
            
            await Task.WhenAll(coOccurrenceTask, semanticTask, temporalTask);
            
            var totalDiscovered = coOccurrenceTask.Result.Count + 
                                semanticTask.Result.Count + 
                                temporalTask.Result.Count;
            
            return Ok(new {
                totalDiscovered,
                coOccurrence = coOccurrenceTask.Result.Count,
                semantic = semanticTask.Result.Count,
                temporal = temporalTask.Result.Count,
                message = $"Discovered {totalDiscovered} new relationships across all analysis types"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during comprehensive relationship discovery for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to discover relationships" });
        }
    }

    /// <summary>
    /// Get detailed graph structure insights
    /// </summary>
    [HttpGet("insights")]
    public async Task<ActionResult<GraphInsights>> GetGraphInsights()
    {
        try
        {
            _logger.LogInformation("Analyzing graph structure for user {UserId}", _userContext.UserId);
            var insights = await _graphService.AnalyzeGraphStructureAsync();
            return Ok(insights);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analyzing graph structure for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to analyze graph structure" });
        }
    }

    /// <summary>
    /// Get graph health and connectivity metrics
    /// </summary>
    [HttpGet("health")]
    public async Task<ActionResult> GetGraphHealth()
    {
        try
        {
            _logger.LogInformation("Checking graph health for user {UserId}", _userContext.UserId);
            
            var insights = await _graphService.AnalyzeGraphStructureAsync();
            var stats = await _graphService.GetEntityStatisticsAsync();
            
            var health = new
            {
                status = "healthy",
                entities = insights.TotalEntities,
                relationships = insights.TotalRelationships,
                density = insights.GraphDensity,
                connectivity = insights.TotalEntities > 0 ? (double)insights.ConnectedEntities / insights.TotalEntities : 0,
                isolatedEntities = insights.IsolatedEntities,
                topEntityTypes = stats.OrderByDescending(kvp => kvp.Value).Take(5),
                lastAnalyzed = insights.GeneratedAt
            };
            
            return Ok(health);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking graph health for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { status = "error", message = "Error checking graph health" });
        }
    }
}
