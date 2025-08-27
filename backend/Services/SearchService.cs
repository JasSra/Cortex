using Microsoft.EntityFrameworkCore;
using CortexApi.Data;
using CortexApi.Models;

namespace CortexApi.Services;

public interface ISearchService
{
    Task<List<SearchResult>> SearchAsync(string query, int limit = 20, Dictionary<string, string>? filters = null);
}

public class SearchService : ISearchService
{
    private readonly CortexDbContext _context;
    private readonly ILogger<SearchService> _logger;

    public SearchService(CortexDbContext context, ILogger<SearchService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<List<SearchResult>> SearchAsync(string query, int limit = 20, Dictionary<string, string>? filters = null)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return new List<SearchResult>();
        }

        try
        {
            // Build the base query
            var baseQuery = from chunk in _context.NoteChunks
                           join note in _context.Notes on chunk.NoteId equals note.Id
                           where chunk.Content.Contains(query) // Simple LIKE search for now
                           select new SearchResult
                           {
                               NoteId = note.Id,
                               Title = note.Title,
                               ChunkContent = chunk.Content,
                               FileType = note.FileType,
                               CreatedAt = note.CreatedAt,
                               Score = 1.0 // Placeholder scoring
                           };

            // Apply filters
            if (filters != null)
            {
                if (filters.TryGetValue("fileType", out var fileType) && !string.IsNullOrEmpty(fileType))
                {
                    baseQuery = baseQuery.Where(r => r.FileType == fileType);
                }

                if (filters.TryGetValue("dateFrom", out var dateFromStr) && DateTime.TryParse(dateFromStr, out var dateFrom))
                {
                    baseQuery = baseQuery.Where(r => r.CreatedAt >= dateFrom);
                }

                if (filters.TryGetValue("dateTo", out var dateToStr) && DateTime.TryParse(dateToStr, out var dateTo))
                {
                    baseQuery = baseQuery.Where(r => r.CreatedAt <= dateTo);
                }
            }

            // Execute query with limit
            var results = await baseQuery
                .OrderByDescending(r => r.CreatedAt)
                .Take(limit)
                .ToListAsync();

            // Calculate basic BM25-like scoring
            foreach (var result in results)
            {
                result.Score = CalculateRelevanceScore(query, result.ChunkContent);
            }

            return results.OrderByDescending(r => r.Score).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error performing search for query: {Query}", query);
            return new List<SearchResult>();
        }
    }

    private double CalculateRelevanceScore(string query, string content)
    {
        if (string.IsNullOrWhiteSpace(query) || string.IsNullOrWhiteSpace(content))
            return 0.0;

        var queryTerms = query.ToLower().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var contentLower = content.ToLower();
        var contentWords = contentLower.Split(' ', StringSplitOptions.RemoveEmptyEntries);

        double score = 0.0;

        foreach (var term in queryTerms)
        {
            // Term frequency in document
            var tf = contentWords.Count(w => w.Contains(term));
            if (tf > 0)
            {
                // Simple scoring: more matches = higher score
                score += Math.Log(1 + tf);
                
                // Boost for exact matches
                if (contentLower.Contains(term))
                {
                    score += 1.0;
                }
            }
        }

        // Normalize by content length
        return score / Math.Log(1 + contentWords.Length);
    }
}
