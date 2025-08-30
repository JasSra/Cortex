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
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;

    public SuggestionsController(
        ISuggestionsService suggestionsService,
        ILogger<SuggestionsController> logger,
        IUserContextAccessor userContext,
        IHttpClientFactory httpClientFactory,
        IConfiguration config)
    {
        _suggestionsService = suggestionsService;
        _logger = logger;
        _userContext = userContext;
        _httpClientFactory = httpClientFactory;
        _config = config;
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

    /// <summary>
    /// Lightweight AI assist endpoint for editor suggestions and summaries
    /// </summary>
    [HttpPost("assist")]
    public async Task<ActionResult<SuggestionResponse>> Assist([FromBody] SuggestionRequest req)
    {
        try
        {
            var mode = (req.Mode ?? "suggest").ToLowerInvariant();
            var provider = (req.Provider ?? "openai").ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(req.Context) && string.IsNullOrWhiteSpace(req.Prompt))
            {
                return BadRequest(new { error = "context or prompt required" });
            }

            // Build concise system instruction tuned for low-latency completions
            var system = mode switch
            {
                "summarize" => "You are a concise note summarizer. Return a short, clear summary (1-3 sentences).",
                "rewrite" => "You are a writing assistant. Improve clarity and brevity while preserving meaning.",
                _ => "You are an efficient note assistant. Suggest the next sentence or small edits, very concise."
            };

            var userContent = BuildUserMessage(req);

            if (provider == "openai")
            {
                var apiKey = _config["OpenAI:ApiKey"] ?? _config["OPENAI_API_KEY"];
                var model = _config["OpenAI:Model"] ?? _config["OPENAI_MODEL"] ?? "gpt-4o-mini";
                if (string.IsNullOrWhiteSpace(apiKey))
                {
                    return StatusCode(500, new { error = "OpenAI API key not configured" });
                }

                var payload = new
                {
                    model,
                    messages = new object[]
                    {
                        new { role = "system", content = system },
                        new { role = "user", content = userContent }
                    },
                    temperature = (double?)req.Temperature ?? (mode == "suggest" ? 0.4 : 0.2),
                    max_tokens = req.MaxTokens ?? 120,
                };

                var http = _httpClientFactory.CreateClient();
                http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
                var json = System.Text.Json.JsonSerializer.Serialize(payload);
                using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
                using var resp = await http.PostAsync("https://api.openai.com/v1/chat/completions", content);
                var body = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Assist call failed: {Status} {Body}", (int)resp.StatusCode, body);
                    return StatusCode((int)resp.StatusCode, new { error = "AI provider error" });
                }

                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(body);
                    var root = doc.RootElement;
                    var first = root.GetProperty("choices")[0];
                    var text = first.GetProperty("message").GetProperty("content").GetString() ?? string.Empty;
                    return Ok(new SuggestionResponse { Text = text });
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed parsing OpenAI response");
                    return StatusCode(500, new { error = "Failed to parse AI response" });
                }
            }
            else if (provider == "ollama")
            {
                var ollamaUrl = _config["OLLAMA_URL"] ?? "http://localhost:11434";
                var model = _config["OLLAMA_MODEL"] ?? "llama3.2:3b";
                var payload = new { model, prompt = $"{system}\n\n{userContent}", stream = false };
                var http = _httpClientFactory.CreateClient();
                var json = System.Text.Json.JsonSerializer.Serialize(payload);
                using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
                using var resp = await http.PostAsync($"{ollamaUrl}/api/generate", content);
                var body = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Ollama assist failed: {Status} {Body}", (int)resp.StatusCode, body);
                    return StatusCode((int)resp.StatusCode, new { error = "AI provider error" });
                }
                using var doc = System.Text.Json.JsonDocument.Parse(body);
                var text = doc.RootElement.TryGetProperty("response", out var r) ? r.GetString() ?? string.Empty : string.Empty;
                return Ok(new SuggestionResponse { Text = text });
            }
            else
            {
                return BadRequest(new { error = "Unsupported provider" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Assist endpoint error for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to generate suggestion" });
        }
    }

    private static string BuildUserMessage(SuggestionRequest req)
    {
        var sb = new System.Text.StringBuilder();
        if (!string.IsNullOrWhiteSpace(req.Context))
        {
            sb.AppendLine("Context:");
            sb.AppendLine(req.Context.Trim());
            sb.AppendLine();
        }
        if (!string.IsNullOrWhiteSpace(req.Prompt))
        {
            sb.AppendLine("Instruction:");
            sb.AppendLine(req.Prompt.Trim());
        }
        return sb.ToString().Trim();
    }
}

public class SuggestionRequest
{
    public string? Prompt { get; set; }
    public string? Context { get; set; }
    public string? Mode { get; set; } // suggest | summarize | rewrite
    public string? Provider { get; set; } // openai | ollama
    public int? MaxTokens { get; set; }
    public double? Temperature { get; set; }
}

public class SuggestionResponse
{
    public string Text { get; set; } = string.Empty;
}
