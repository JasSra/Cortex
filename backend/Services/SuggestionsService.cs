using CortexApi.Models;
using CortexApi.Data;
using Microsoft.EntityFrameworkCore;
using CortexApi.Services.Providers;

namespace CortexApi.Services;

public interface ISuggestionsService
{
    Task<DailyDigest> GenerateDailyDigestAsync(DateTime? date = null);
    Task<List<ProactiveSuggestion>> GetProactiveSuggestionsAsync(int limit = 5);
    Task<List<string>> GetTrendingTopicsAsync(int days = 7, int limit = 10);
    Task<List<EntityInsight>> GetEntityInsightsAsync(string? entityType = null);

    // Suggest a concise title for a note based on its textual content
    Task<string?> SuggestNoteTitleAsync(string content, string? fileNameHint = null, CancellationToken ct = default);
}

public class SuggestionsService : ISuggestionsService
{
    private readonly CortexDbContext _context;
    private readonly ISearchService _searchService;
    private readonly IGraphService _graphService;
    private readonly INerService _nerService;
    private readonly ILogger<SuggestionsService> _logger;
    private readonly ILlmProvider _llmProvider;

    public SuggestionsService(
        CortexDbContext context,
        ISearchService searchService,
        IGraphService graphService,
        INerService nerService,
        ILogger<SuggestionsService> logger,
        ILlmProvider llmProvider)
    {
        _context = context;
        _searchService = searchService;
        _graphService = graphService;
        _nerService = nerService;
        _logger = logger;
        _llmProvider = llmProvider;
    }

    public async Task<DailyDigest> GenerateDailyDigestAsync(DateTime? date = null)
    {
        var targetDate = date ?? DateTime.Today;
        var startDate = targetDate.Date;
        var endDate = startDate.AddDays(1);

        _logger.LogInformation("Generating daily digest for {Date}", targetDate.ToString("yyyy-MM-dd"));

        // Get today's activity
        var todaysNotes = await _context.Notes
            .Where(n => n.CreatedAt >= startDate && n.CreatedAt < endDate)
            .OrderByDescending(n => n.CreatedAt)
            .Take(10)
            .ToListAsync();

        var todaysClassifications = await _context.Classifications
            .Include(c => c.Note)
            .Where(c => c.CreatedAt >= startDate && c.CreatedAt < endDate)
            .GroupBy(c => c.Label)
            .Select(g => new { Category = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ToListAsync();

        // Get trending entities (last 7 days)
        var weekAgo = startDate.AddDays(-7);
        var trendingEntities = await _context.Entities
            .Where(e => e.CreatedAt >= weekAgo && e.CreatedAt < endDate)
            .GroupBy(e => e.Type)
            .Select(g => new { Type = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .Take(5)
            .ToListAsync();

        // Generate insights and suggestions
        var insights = GenerateInsightsAsync(todaysNotes, todaysClassifications.Select(c => c.Category).ToList());
        var suggestions = await GetProactiveSuggestionsAsync(5);

        // Get connected entity clusters
        var entityClusters = await GetEntityClustersAsync();

        return new DailyDigest
        {
            Date = targetDate,
            Summary = GenerateSummaryText(todaysNotes.Count, todaysClassifications.Count),
            RecentActivity = new ActivitySummary
            {
                NotesCreated = todaysNotes.Count,
                TopCategories = todaysClassifications.Select(c => new CategoryCount 
                { 
                    Category = c.Category, 
                    Count = c.Count 
                }).ToList(),
                TrendingEntities = trendingEntities.Select(e => new EntityTrend 
                { 
                    EntityType = e.Type, 
                    Count = e.Count,
                    TrendDirection = "up" // Could be enhanced with actual trend calculation
                }).ToList()
            },
            KeyInsights = insights,
            ProactiveSuggestions = suggestions,
            EntityClusters = entityClusters,
            GeneratedAt = DateTime.UtcNow
        };
    }

    public async Task<List<ProactiveSuggestion>> GetProactiveSuggestionsAsync(int limit = 5)
    {
        var suggestions = new List<ProactiveSuggestion>();

        // Suggest based on recent activity patterns
        var recentNotes = await _context.Notes
            .Where(n => n.CreatedAt >= DateTime.Today.AddDays(-7))
            .Include(n => n.Classifications)
            .Include(n => n.Tags)
            .ToListAsync();

        // Suggest tagging for untagged notes
        var untaggedNotes = recentNotes.Where(n => !n.Tags.Any()).ToList();
        if (untaggedNotes.Any())
        {
            suggestions.Add(new ProactiveSuggestion
            {
                Type = "tagging",
                Title = "Tag Recent Notes",
                Description = $"You have {untaggedNotes.Count} recent notes that could benefit from tags.",
                ActionUrl = "/notes?filter=untagged",
                Priority = "medium",
                EstimatedTimeMinutes = untaggedNotes.Count * 2
            });
        }

        // Suggest reviewing old notes
        var oldNotes = await _context.Notes
            .Where(n => n.CreatedAt <= DateTime.Today.AddDays(-30))
            .Where(n => !n.Classifications.Any())
            .Take(10)
            .ToListAsync();

        if (oldNotes.Any())
        {
            suggestions.Add(new ProactiveSuggestion
            {
                Type = "review",
                Title = "Review Old Notes",
                Description = $"Found {oldNotes.Count} older notes that might need classification or cleanup.",
                ActionUrl = "/notes?filter=old&unclassified=true",
                Priority = "low",
                EstimatedTimeMinutes = 15
            });
        }

        // Suggest exploring entity connections
        var isolatedEntities = await GetIsolatedEntitiesAsync();
        if (isolatedEntities.Any())
        {
            suggestions.Add(new ProactiveSuggestion
            {
                Type = "connection",
                Title = "Explore Entity Connections",
                Description = $"Found {isolatedEntities.Count} entities that might have interesting connections.",
                ActionUrl = "/graph?focus=isolated",
                Priority = "medium",
                EstimatedTimeMinutes = 10
            });
        }

        // Suggest content gaps based on classification patterns
        var commonCategories = await _context.Classifications
            .GroupBy(c => c.Label)
            .Where(g => g.Count() > 5)
            .Select(g => g.Key)
            .ToListAsync();

        if (commonCategories.Any())
        {
            var randomCategory = commonCategories[new Random().Next(commonCategories.Count)];
            suggestions.Add(new ProactiveSuggestion
            {
                Type = "content_gap",
                Title = "Content Opportunity",
                Description = $"You have good coverage in '{randomCategory}' - consider exploring related topics.",
                ActionUrl = $"/search?category={randomCategory}",
                Priority = "low",
                EstimatedTimeMinutes = 20
            });
        }

        return suggestions.OrderByDescending(s => s.Priority == "high" ? 3 : s.Priority == "medium" ? 2 : 1)
                        .Take(limit)
                        .ToList();
    }

    public async Task<List<string>> GetTrendingTopicsAsync(int days = 7, int limit = 10)
    {
        var startDate = DateTime.Today.AddDays(-days);
        
        var trendingFromNotes = await _context.Notes
            .Where(n => n.CreatedAt >= startDate)
            .SelectMany(n => n.Content.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            .Where(word => word.Length > 4) // Filter out short words
            .GroupBy(word => word.ToLowerInvariant())
            .OrderByDescending(g => g.Count())
            .Take(limit)
            .Select(g => g.Key)
            .ToListAsync();

        return trendingFromNotes;
    }

    public async Task<List<EntityInsight>> GetEntityInsightsAsync(string? entityType = null)
    {
        var query = _context.Entities.AsQueryable();
        
        if (!string.IsNullOrEmpty(entityType))
        {
            query = query.Where(e => e.Type == entityType);
        }

        var entityStats = await query
            .GroupBy(e => new { e.Type, e.Value })
            .Select(g => new EntityInsight
            {
                EntityType = g.Key.Type,
                EntityValue = g.Key.Value,
                Frequency = g.Count(),
                LastSeen = g.Max(e => e.CreatedAt),
                Confidence = g.Average(e => e.ConfidenceScore)
            })
            .OrderByDescending(e => e.Frequency)
            .Take(20)
            .ToListAsync();

        return entityStats;
    }

    public async Task<string?> SuggestNoteTitleAsync(string content, string? fileNameHint = null, CancellationToken ct = default)
    {
        try
        {
            // Trim content to avoid long prompts
            var maxChars = 4000;
            var snippet = content.Length > maxChars ? content.Substring(0, maxChars) : content;

            var prompt = $@"You are a naming assistant. Given a note's textual content, propose a concise, specific title under 8 words.
- No quotes, no trailing punctuation.
- Prefer informative nouns, avoid generic words like 'note' or 'document'.
- If a filename hint is provided, you may use it to keep context but improve it.

Filename hint: {fileNameHint ?? "(none)"}

Content snippet:
---
{snippet}
---
Return ONLY the title as plain text.";

            var messages = new List<ChatMessage>
            {
                new ChatMessage 
                { 
                    Role = "system", 
                    Content = "You generate only a concise title as plain text." 
                },
                new ChatMessage 
                { 
                    Role = "user", 
                    Content = prompt 
                }
            };

            var response = await _llmProvider.GenerateChatCompletionAsync(messages, new LlmCompletionOptions
            {
                Temperature = 0.2,
                MaxTokens = 20
            }, ct);

            if (string.IsNullOrWhiteSpace(response))
                return null;

            var title = response.Trim().Trim('"');
            
            // Enforce 8-word limit softly
            var words = title.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (words.Length > 8) 
                title = string.Join(' ', words.Take(8));
                
            return title;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SuggestNoteTitleAsync failed");
            return null;
        }
    }

    private List<string> GenerateInsightsAsync(List<Note> todaysNotes, List<string> topCategories)
    {
        var insights = new List<string>();

        if (todaysNotes.Any())
        {
            insights.Add($"You've been productive today with {todaysNotes.Count} new notes.");
            
            if (topCategories.Any())
            {
                insights.Add($"Your focus areas today: {string.Join(", ", topCategories.Take(3))}");
            }
        }

        // Analyze content themes
        var contentWords = todaysNotes
            .SelectMany(n => n.Content.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            .Where(w => w.Length > 4)
            .GroupBy(w => w.ToLowerInvariant())
            .OrderByDescending(g => g.Count())
            .Take(3)
            .Select(g => g.Key)
            .ToList();

        if (contentWords.Any())
        {
            insights.Add($"Key themes emerging: {string.Join(", ", contentWords)}");
        }

        return insights;
    }

    private string GenerateSummaryText(int noteCount, int classificationCount)
    {
        if (noteCount == 0)
        {
            return "A quiet day - no new notes created.";
        }

        var efficiency = classificationCount > 0 ? (double)classificationCount / noteCount : 0;
        
        if (efficiency > 0.8)
        {
            return $"Highly productive day! {noteCount} notes created with excellent organization.";
        }
        else if (efficiency > 0.5)
        {
            return $"Good productivity with {noteCount} notes created and solid categorization.";
        }
        else
        {
            return $"Active day with {noteCount} notes - consider reviewing for better organization.";
        }
    }

    private async Task<List<EntityCluster>> GetEntityClustersAsync()
    {
        // Find entities that frequently co-occur
        var entityPairs = await _context.Edges
            .Include(e => e.FromEntity)
            .Include(e => e.ToEntity)
            .Where(e => e.RelationType == "co_occurrence")
            .GroupBy(e => new { FromType = e.FromEntity.Type, ToType = e.ToEntity.Type })
            .Select(g => new EntityCluster
            {
                Name = $"{g.Key.FromType} ↔ {g.Key.ToType}",
                EntityTypes = new List<string> { g.Key.FromType, g.Key.ToType },
                Strength = g.Count(),
                Description = $"{g.Count()} connections found between {g.Key.FromType} and {g.Key.ToType} entities"
            })
            .OrderByDescending(c => c.Strength)
            .Take(5)
            .ToListAsync();

        return entityPairs;
    }

    private async Task<List<string>> GetIsolatedEntitiesAsync()
    {
        var connectedEntityIds = await _context.Edges
            .SelectMany(e => new[] { e.FromEntityId, e.ToEntityId })
            .Distinct()
            .ToListAsync();

        var isolatedEntities = await _context.Entities
            .Where(e => !connectedEntityIds.Contains(e.Id))
            .Take(10)
            .Select(e => e.Value)
            .ToListAsync();

        return isolatedEntities;
    }
}
