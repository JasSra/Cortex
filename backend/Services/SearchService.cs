using Microsoft.EntityFrameworkCore;
using CortexApi.Data;
using CortexApi.Models;

namespace CortexApi.Services;

public interface ISearchService
{
    Task<List<SearchResult>> SearchAsync(string query, int limit = 20, Dictionary<string, string>? filters = null);
    Task<SearchResponse> SearchHybridAsync(SearchRequest request, string userId);
}

public class SearchService : ISearchService
{
    private readonly CortexDbContext _context;
    private readonly ILogger<SearchService> _logger;
    private readonly IEmbeddingService _embeddingService;
    private readonly IVectorService _vectorService;

    public SearchService(CortexDbContext context, ILogger<SearchService> logger, IEmbeddingService embeddingService, IVectorService vectorService)
    {
        _context = context;
        _logger = logger;
        _embeddingService = embeddingService;
        _vectorService = vectorService;
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

    public async Task<SearchResponse> SearchHybridAsync(SearchRequest request, string userId)
    {
        var mode = (request.Mode ?? "hybrid").ToLowerInvariant();
        var alpha = Math.Clamp(request.Alpha, 0.0, 1.0);
        var k = Math.Clamp(request.K <= 0 ? 10 : request.K, 1, 100);
        var q = request.Q ?? string.Empty;

        var semanticScores = new Dictionary<string, double>(); // chunkId -> score
        if (mode is "hybrid" or "semantic")
        {
            var vec = await _embeddingService.EmbedAsync(q);
            if (vec is not null)
            {
                var knn = await _vectorService.KnnAsync(vec, k, userId);
                // Normalize cosine distance (if present) to [0..1] score; here assume scores are similarity already
                double max = knn.Count > 0 ? knn.Max(x => x.score) : 1e-9;
                foreach (var (chunkId, score) in knn)
                {
                    semanticScores[chunkId] = max > 0 ? score / max : 0.0;
                }
            }
        }

        var textResults = new List<(NoteChunk chunk, Note note, double bm25)>();
        if (mode is "hybrid" or "bm25")
        {
            var baseQuery = from chunk in _context.NoteChunks
                            join note in _context.Notes on chunk.NoteId equals note.Id
                            where !note.IsDeleted && note.UserId == userId && chunk.Content.Contains(q)
                            select new { chunk, note };

            // Apply Stage1 filters
            var filters = request.Filters ?? new Dictionary<string, string>();
            if (filters.TryGetValue("source", out var source) && !string.IsNullOrWhiteSpace(source))
            {
                baseQuery = baseQuery.Where(x => x.note.Source == source);
            }
            if (filters.TryGetValue("dateFrom", out var dateFromStr) && DateTime.TryParse(dateFromStr, out var dateFrom))
            {
                baseQuery = baseQuery.Where(x => x.note.CreatedAt >= dateFrom);
            }
            if (filters.TryGetValue("dateTo", out var dateToStr) && DateTime.TryParse(dateToStr, out var dateTo))
            {
                baseQuery = baseQuery.Where(x => x.note.CreatedAt <= dateTo);
            }
            if (filters.TryGetValue("labels", out var labelsCsv) && !string.IsNullOrWhiteSpace(labelsCsv))
            {
                var labels = labelsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                baseQuery = baseQuery.Where(x => _context.Set<NoteTag>().Any(nt => nt.NoteId == x.note.Id && _context.Set<Tag>().Any(t => t.Id == nt.TagId && labels.Contains(t.Name))));
            }
            var limited = await baseQuery.Take(k * 2).ToListAsync();
            foreach (var row in limited)
            {
                var score = CalculateRelevanceScore(q, row.chunk.Content);
                textResults.Add((row.chunk, row.note, score));
            }
        }

        var merged = new Dictionary<string, SearchHit>();
        foreach (var r in textResults)
        {
            var id = r.chunk.Id;
            var sem = semanticScores.TryGetValue(id, out var s) ? s : 0.0;
            var score = alpha * sem + (1 - alpha) * r.bm25;
            // Find first occurrence for offsets and snippet window around it
            var idx = string.IsNullOrWhiteSpace(q) ? -1 : r.chunk.Content.IndexOf(q, StringComparison.OrdinalIgnoreCase);
            int start = idx >= 0 ? Math.Max(0, idx - 60) : 0;
            int length = idx >= 0 ? Math.Min(r.chunk.Content.Length - start, q.Length) : 0;
            var windowLen = 220;
            var endWindow = Math.Min(r.chunk.Content.Length, (idx >= 0 ? idx + q.Length + 160 : 220));
            var snippetStart = start;
            var snippetLength = Math.Min(windowLen, endWindow - snippetStart);
            var snippet = r.chunk.Content.Substring(snippetStart, Math.Max(0, snippetLength));
            if (snippetStart > 0) snippet = "…" + snippet;
            if (snippetStart + snippetLength < r.chunk.Content.Length) snippet += "…";
            merged[id] = new SearchHit
            {
                NoteId = r.note.Id,
                ChunkId = id,
                Title = r.note.Title,
                Snippet = string.IsNullOrEmpty(snippet) ? (r.chunk.Content.Length > 500 ? r.chunk.Content.Substring(0, 500) + "…" : r.chunk.Content) : snippet,
                Offsets = idx >= 0 ? new[] { idx, length } : Array.Empty<int>(),
                ChunkIndex = r.chunk.ChunkIndex,
                Score = score
            };
        }

        // Include purely vector hits if in semantic-only or hybrid mode
        foreach (var kvp in semanticScores)
        {
            if (!merged.ContainsKey(kvp.Key))
            {
                var chunk = await _context.NoteChunks.FindAsync(kvp.Key);
                if (chunk is null) continue;
                var note = await _context.Notes.FindAsync(chunk.NoteId);
                if (note is null) continue;
                // Best-effort snippet: start of chunk; offsets unknown
                var idx = string.IsNullOrWhiteSpace(q) ? -1 : chunk.Content.IndexOf(q, StringComparison.OrdinalIgnoreCase);
                int length = idx >= 0 ? q.Length : 0;
                var snippet = chunk.Content.Length > 300 ? chunk.Content.Substring(0, 300) + "…" : chunk.Content;
                merged[kvp.Key] = new SearchHit
                {
                    NoteId = note.Id,
                    ChunkId = kvp.Key,
                    Title = note.Title,
                    Snippet = snippet,
                    Offsets = idx >= 0 ? new[] { idx, length } : Array.Empty<int>(),
                    ChunkIndex = chunk.ChunkIndex,
                    Score = kvp.Value * alpha
                };
            }
        }

        var hits = merged.Values.OrderByDescending(h => h.Score).Take(k).ToList();
        return new SearchResponse { Hits = hits };
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
