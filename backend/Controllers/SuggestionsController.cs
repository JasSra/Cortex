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
    private readonly ILlmProvider _llmProvider;
    private readonly IClassificationService _classificationService;

    public SuggestionsController(
        ISuggestionsService suggestionsService,
        ILogger<SuggestionsController> logger,
        IUserContextAccessor userContext,
        ILlmProvider llmProvider,
        IClassificationService classificationService)
    {
        _suggestionsService = suggestionsService;
        _logger = logger;
        _userContext = userContext;
        _llmProvider = llmProvider;
        _classificationService = classificationService;
    }

    /// <summary>
    /// AI Assist endpoint for generic text processing
    /// </summary>
    [HttpPost("assist")]
    public async Task<ActionResult<AssistResponse>> Assist([FromBody] AssistRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Context) && string.IsNullOrWhiteSpace(request.Prompt))
            {
                return BadRequest(new { error = "Either context or prompt is required" });
            }

            var messages = new List<ChatMessage>();
            
            switch (request.Mode?.ToLower())
            {
                case "summarize":
                    messages.Add(new ChatMessage 
                    { 
                        Role = "system", 
                        Content = "You are a helpful assistant that creates concise, informative summaries. Focus on key points and actionable insights." 
                    });
                    messages.Add(new ChatMessage 
                    { 
                        Role = "user", 
                        Content = $"Please summarize the following text:\n\n{request.Context}" 
                    });
                    break;
                
                case "suggest":
                    messages.Add(new ChatMessage 
                    { 
                        Role = "system", 
                        Content = "You are a helpful assistant that provides suggestions and recommendations." 
                    });
                    messages.Add(new ChatMessage 
                    { 
                        Role = "user", 
                        Content = request.Prompt ?? $"Please provide suggestions for:\n\n{request.Context}" 
                    });
                    break;
                
                case "rewrite":
                    messages.Add(new ChatMessage 
                    { 
                        Role = "system", 
                        Content = "You are a helpful assistant that improves and rewrites text while maintaining the original meaning." 
                    });
                    messages.Add(new ChatMessage 
                    { 
                        Role = "user", 
                        Content = $"Please rewrite and improve the following text:\n\n{request.Context}" 
                    });
                    break;
                
                default:
                    messages.Add(new ChatMessage 
                    { 
                        Role = "system", 
                        Content = "You are a helpful assistant." 
                    });
                    if (!string.IsNullOrWhiteSpace(request.Prompt))
                    {
                        messages.Add(new ChatMessage 
                        { 
                            Role = "user", 
                            Content = request.Context != null ? $"{request.Prompt}\n\nContext: {request.Context}" : request.Prompt 
                        });
                    }
                    else
                    {
                        messages.Add(new ChatMessage 
                        { 
                            Role = "user", 
                            Content = request.Context ?? string.Empty 
                        });
                    }
                    break;
            }

            var options = new LlmCompletionOptions
            {
                Temperature = request.Temperature ?? 0.3,
                MaxTokens = request.MaxTokens ?? 200
            };

            var response = await _llmProvider.GenerateChatCompletionAsync(messages, options);
            
            return Ok(new AssistResponse { Text = response ?? "No response generated" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process assist request for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to process request", details = ex.Message });
        }
    }

    /// <summary>
    /// AI Summary endpoint for generating summaries of text content
    /// </summary>
    [HttpPost("summary")]
    public async Task<ActionResult<SummaryResponse>> GenerateSummary([FromBody] SummaryRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Content))
            {
                return BadRequest(new { error = "Content is required" });
            }

            _logger.LogInformation("Generating AI summary for user {UserId}", _userContext.UserId);

            var messages = new List<ChatMessage>
            {
                new ChatMessage 
                { 
                    Role = "system", 
                    Content = "You are an expert at creating concise, informative summaries. Extract the key points, main ideas, and actionable insights from the provided text. Keep the summary focused and useful." 
                },
                new ChatMessage 
                { 
                    Role = "user", 
                    Content = $"Please create a summary of the following text (max {request.MaxLength ?? 200} words):\n\n{request.Content}" 
                }
            };

            var options = new LlmCompletionOptions
            {
                Temperature = 0.3,
                MaxTokens = Math.Min(request.MaxLength ?? 200, 500)
            };

            var summary = await _llmProvider.GenerateChatCompletionAsync(messages, options);
            
            return Ok(new SummaryResponse 
            { 
                Summary = summary ?? "Unable to generate summary",
                WordCount = summary?.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length ?? 0
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate summary for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to generate summary", details = ex.Message });
        }
    }

    /// <summary>
    /// AI Classification endpoint for analyzing and categorizing content
    /// </summary>
        [HttpPost("classify")]
    public async Task<ActionResult<ClassificationResponse>> ClassifyContent(ClassificationRequest request)
    {
        try
        {
            var userId = _userContext.UserId;
            var result = await _classificationService.ClassifyTextAsync(request.Content);

            return Ok(new ClassificationResponse
            {
                NoteId = string.Empty, // No note ID for standalone classification
                Tags = result.Tags.Select(t => t.Name).ToList(),
                Sensitivity = result.SensitivityLevel,
                SensitivityScore = result.Confidence,
                Pii = result.PiiFlags.Select(p => p.Type).ToList(),
                Secrets = result.SecretFlags.Select(s => s.Type).ToList(),
                Summary = result.Summary,
                Confidence = result.Confidence,
                ProcessedAt = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error classifying content");
            return BadRequest($"Classification failed: {ex.Message}");
        }
    }

    private List<string> ExtractTagsFromText(string text)
    {
        // Simple tag extraction from AI response
        var tags = new List<string>();
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        foreach (var line in lines)
        {
            if (line.Contains("tag", StringComparison.OrdinalIgnoreCase) || 
                line.Contains("category", StringComparison.OrdinalIgnoreCase))
            {
                var parts = line.Split(':', ',', ';');
                foreach (var part in parts)
                {
                    var cleaned = part.Trim().Trim('"', '\'', '-', '*', ' ');
                    if (cleaned.Length > 2 && cleaned.Length < 30 && 
                        !cleaned.Contains("tag", StringComparison.OrdinalIgnoreCase))
                    {
                        tags.Add(cleaned);
                    }
                }
            }
        }
        return tags.Take(6).ToList();
    }

    /// <summary>
    /// Get daily digest for today or specified date
    /// </summary>
    [HttpGet("digest/today")]
    public ActionResult<DailyDigest> GetTodaysDigest()
    {
        return GetDailyDigest(DateTime.Today);
    }

    /// <summary>
    /// Get daily digest for a specific date
    /// </summary>
    [HttpGet("daily-digest")]
    public ActionResult<DailyDigest> GetDailyDigest(DateTime date)
    {
        // TODO: Implement daily digest generation
        return Ok(new DailyDigest
        {
            Date = date,
            Summary = "Daily digest functionality coming soon...",
            RecentActivity = new ActivitySummary(),
            KeyInsights = new List<string>(),
            ProactiveSuggestions = new List<ProactiveSuggestion>(),
            EntityClusters = new List<EntityCluster>(),
            GeneratedAt = DateTime.UtcNow
        });
    }    /// <summary>
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
    [HttpGet("insights")]
    public ActionResult<EntityInsights> GetEntityInsights()
    {
        // TODO: Implement entity insights generation
        var insights = new EntityInsights
        {
            TopEntities = new List<string> { "Coming soon..." },
            RecentConnections = new List<string>(),
            SuggestedExplorations = new List<string>()
        };
        
        return Ok(insights);
    }

    /// <summary>
    /// Get proactive suggestions for the current user (tasks, reviews, opportunities)
    /// </summary>
    [HttpGet("proactive")]
    public async Task<ActionResult<List<ProactiveSuggestion>>> GetProactiveSuggestions([FromQuery] int limit = 5)
    {
        try
        {
            if (limit <= 0) limit = 5;
            var suggestions = await _suggestionsService.GetProactiveSuggestionsAsync(limit);
            return Ok(suggestions ?? new List<ProactiveSuggestion>());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get proactive suggestions for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to get proactive suggestions" });
        }
    }
}

// Request/Response models
public class NoteTitleRequest
{
    public string Content { get; set; } = string.Empty;
}
