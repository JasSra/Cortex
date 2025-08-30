using Microsoft.EntityFrameworkCore;
using CortexApi.Data;
using CortexApi.Models;
using System.Text.RegularExpressions;

namespace CortexApi.Services;

public interface ISearchService
{
    Task<List<SearchResult>> SearchAsync(string query, int limit = 20, Dictionary<string, string>? filters = null);
    Task<SearchResponse> SearchHybridAsync(SearchRequest request, string userId);
    Task<SearchResponse> SearchAdvancedAsync(AdvancedSearchRequest request, string userId);
}

public class SearchService : ISearchService
{
    private readonly CortexDbContext _context;
    private readonly ILogger<SearchService> _logger;
    private readonly IEmbeddingService _embeddingService;
    private readonly IVectorService _vectorService;
    
    // BM25 parameters
    private const double K1 = 1.2;
    private const double B = 0.75;

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
        var offset = Math.Max(0, request.Offset);
        var q = request.Q ?? string.Empty;
        var fetch = Math.Min(200, offset > 0 ? offset + (k * 2) : (k * 2));

        var semanticScores = new Dictionary<string, double>(); // chunkId -> score
        if (mode is "hybrid" or "semantic")
        {
            var vec = await _embeddingService.EmbedAsync(q);
            if (vec is not null)
            {
                var knn = await _vectorService.KnnAsync(vec, Math.Max(k, fetch), userId);
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
            var limited = await baseQuery.Take(fetch).ToListAsync();
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

        var ordered = merged.Values.OrderByDescending(h => h.Score).ToList();
        var total = ordered.Count;
        var hits = ordered.Skip(offset).Take(k).ToList();
        return new SearchResponse { Hits = hits, Total = total, Offset = offset, K = k };
    }

    public async Task<SearchResponse> SearchAdvancedAsync(AdvancedSearchRequest request, string userId)
    {
        var mode = (request.Mode ?? "hybrid").ToLowerInvariant();
        var alpha = Math.Clamp(request.Alpha, 0.0, 1.0);
        var k = Math.Clamp(request.K <= 0 ? 10 : request.K, 1, 100);
        var offset = Math.Max(0, request.Offset);
        var q = request.Q ?? string.Empty;
        var fetch = Math.Min(300, offset > 0 ? offset + (k * 2) : (k * 2));

        _logger.LogInformation("Advanced search: Query='{Query}', Mode={Mode}, K={K}, Alpha={Alpha}, UseReranking={UseReranking}", 
            q, mode, k, alpha, request.UseReranking);

        // Vector search component
        var semanticScores = new Dictionary<string, double>(); // chunkId -> score
        if (mode is "hybrid" or "semantic")
        {
            var vec = await _embeddingService.EmbedAsync(q);
            if (vec is not null)
            {
                var knn = await _vectorService.KnnAsync(vec, Math.Max(k * 2, fetch), userId); // Get more candidates for reranking/paging
                double max = knn.Count > 0 ? knn.Max(x => x.score) : 1e-9;
                foreach (var (chunkId, score) in knn)
                {
                    semanticScores[chunkId] = max > 0 ? score / max : 0.0;
                }
            }
        }

        // BM25 text search component with advanced filtering
        var textResults = new List<(NoteChunk chunk, Note note, double bm25)>();
        if (mode is "hybrid" or "bm25")
        {
            var baseQuery = from chunk in _context.NoteChunks
                            join note in _context.Notes on chunk.NoteId equals note.Id
                            where !note.IsDeleted && note.UserId == userId
                            select new { chunk, note };

            // Apply advanced Stage 2 filters
            if (request.SensitivityLevels?.Any() == true)
            {
                baseQuery = baseQuery.Where(x => request.SensitivityLevels.Contains(x.note.SensitivityLevel));
            }

            if (request.Tags?.Any() == true)
            {
                baseQuery = baseQuery.Where(x => request.Tags.Any(tag => 
                    x.note.Tags != null && x.note.Tags.Contains(tag)));
            }

            if (request.PiiTypes?.Any() == true)
            {
                baseQuery = baseQuery.Where(x => request.PiiTypes.Any(piiType => 
                    x.note.PiiFlags != null && x.note.PiiFlags.Contains(piiType)));
            }

            if (request.SecretTypes?.Any() == true)
            {
                baseQuery = baseQuery.Where(x => request.SecretTypes.Any(secretType => 
                    x.note.SecretFlags != null && x.note.SecretFlags.Contains(secretType)));
            }

            if (request.ExcludePii)
            {
                baseQuery = baseQuery.Where(x => string.IsNullOrEmpty(x.note.PiiFlags));
            }

            if (request.ExcludeSecrets)
            {
                baseQuery = baseQuery.Where(x => string.IsNullOrEmpty(x.note.SecretFlags));
            }

            // Basic filters
            if (request.DateFrom.HasValue)
            {
                baseQuery = baseQuery.Where(x => x.note.CreatedAt >= request.DateFrom.Value);
            }

            if (request.DateTo.HasValue)
            {
                baseQuery = baseQuery.Where(x => x.note.CreatedAt <= request.DateTo.Value);
            }

            if (request.FileTypes?.Any() == true)
            {
                baseQuery = baseQuery.Where(x => request.FileTypes.Contains(x.note.FileType));
            }

            if (!string.IsNullOrWhiteSpace(request.Source))
            {
                baseQuery = baseQuery.Where(x => x.note.Source == request.Source);
            }

            // Text matching with BM25 scoring
            if (!string.IsNullOrWhiteSpace(q))
            {
                baseQuery = baseQuery.Where(x => x.chunk.Content.Contains(q));
            }

            var limited = await baseQuery.Take(k * 3).ToListAsync(); // Get more for better BM25 scoring

            // Calculate BM25 scores
            var avgDocLength = limited.Any() ? limited.Average(x => x.chunk.Content.Length) : 1.0;
            
            foreach (var row in limited)
            {
                var score = CalculateBM25Score(q, row.chunk.Content, avgDocLength);
                textResults.Add((row.chunk, row.note, score));
            }
        }

        // Merge and combine scores
        var merged = new Dictionary<string, SearchHit>();
        
        // Process text search results
        foreach (var r in textResults)
        {
            var id = r.chunk.Id;
            var sem = semanticScores.TryGetValue(id, out var s) ? s : 0.0;
            var score = alpha * sem + (1 - alpha) * r.bm25;
            
            merged[id] = CreateSearchHit(r.chunk, r.note, q, score);
        }

        // Add semantic-only results
        foreach (var kvp in semanticScores)
        {
            if (!merged.ContainsKey(kvp.Key))
            {
                var chunk = await _context.NoteChunks.FindAsync(kvp.Key);
                if (chunk is null) continue;
                var note = await _context.Notes.FindAsync(chunk.NoteId);
                if (note is null) continue;
                
                merged[kvp.Key] = CreateSearchHit(chunk, note, q, kvp.Value * alpha);
            }
        }

    var hits = merged.Values.OrderByDescending(h => h.Score).Take(fetch).ToList();

        // Apply cross-encoder reranking if enabled
        if (request.UseReranking && !string.IsNullOrWhiteSpace(q) && hits.Count > 1)
        {
            hits = await ApplyCrossEncoderReranking(q, hits);
        }

        var total = hits.Count;
        var paged = hits.Skip(offset).Take(k).ToList();
        return new SearchResponse { Hits = paged, Total = total, Offset = offset, K = k };
    }

    private double CalculateBM25Score(string query, string document, double avgDocLength)
    {
        if (string.IsNullOrWhiteSpace(query) || string.IsNullOrWhiteSpace(document))
            return 0.0;

        const double k1 = 1.2;
        const double b = 0.75;

        var queryTerms = query.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var docTerms = document.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var docLength = docTerms.Length;

        var termFreqs = new Dictionary<string, int>();
        foreach (var term in docTerms)
        {
            termFreqs[term] = termFreqs.GetValueOrDefault(term) + 1;
        }

        double score = 0.0;
        foreach (var queryTerm in queryTerms)
        {
            if (termFreqs.TryGetValue(queryTerm, out var tf))
            {
                // Simplified BM25 without IDF (would need document collection stats)
                var numerator = tf * (k1 + 1);
                var denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
                score += numerator / denominator;
            }
        }

        return score;
    }

    private SearchHit CreateSearchHit(NoteChunk chunk, Note note, string query, double score)
    {
        // Compute best match offset and snippet window
        var (snippet, offsets, snippetStart) = ComputeSnippetAndOffsets(chunk.Content, query);

        return new SearchHit
        {
            ChunkId = chunk.Id,
            NoteId = note.Id,
            Title = note.Title,
            Content = chunk.Content,
            Snippet = snippet,
            Highlight = GenerateHighlight(chunk.Content, query),
            Offsets = offsets,
            SnippetStart = snippetStart,
            Score = score,
            CreatedAt = note.CreatedAt,
            Source = note.Source,
            FileType = note.FileType,
            SensitivityLevel = note.SensitivityLevel,
            Tags = note.Tags?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
            HasPii = !string.IsNullOrEmpty(note.PiiFlags),
            HasSecrets = !string.IsNullOrEmpty(note.SecretFlags),
            PiiTypes = note.PiiFlags?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
            SecretTypes = note.SecretFlags?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>()
        };
    }

    private (string snippet, int[] offsets, int snippetStart) ComputeSnippetAndOffsets(string content, string query)
    {
        if (string.IsNullOrWhiteSpace(content))
            return (string.Empty, Array.Empty<int>(), 0);

        if (string.IsNullOrWhiteSpace(query))
        {
            var sn = content.Length > 300 ? content.Substring(0, 300) + "…" : content;
            return (sn, Array.Empty<int>(), 0);
        }

        var terms = query.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var lower = content.ToLowerInvariant();
        var firstIdx = -1;
        var matchLen = 0;
        foreach (var t in terms)
        {
            var idx = lower.IndexOf(t.ToLowerInvariant(), StringComparison.Ordinal);
            if (idx >= 0 && (firstIdx == -1 || idx < firstIdx))
            {
                firstIdx = idx;
                matchLen = Math.Max(matchLen, t.Length);
            }
        }

        int start = 0;
        if (firstIdx >= 0)
        {
            start = Math.Max(0, firstIdx - 100);
        }
        var end = Math.Min(content.Length, (firstIdx >= 0 ? firstIdx + matchLen + 200 : 300));
        var snippetLen = Math.Max(0, end - start);
        var snippet = content.Substring(start, snippetLen);
        if (start > 0) snippet = "…" + snippet;
        if (start + snippetLen < content.Length) snippet += "…";

        var offsets = firstIdx >= 0 ? new[] { firstIdx, matchLen } : Array.Empty<int>();
        return (snippet, offsets, start);
    }

    private string GenerateHighlight(string content, string query)
    {
        if (string.IsNullOrWhiteSpace(query) || string.IsNullOrWhiteSpace(content))
            return content.Length > 200 ? content.Substring(0, 200) + "..." : content;

        var terms = query.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var lowerContent = content.ToLowerInvariant();
        
        var firstMatch = -1;
        foreach (var term in terms)
        {
            var index = lowerContent.IndexOf(term);
            if (index >= 0 && (firstMatch == -1 || index < firstMatch))
            {
                firstMatch = index;
            }
        }

        if (firstMatch == -1)
        {
            return content.Length > 200 ? content.Substring(0, 200) + "..." : content;
        }

        var start = Math.Max(0, firstMatch - 100);
        var length = Math.Min(300, content.Length - start);
        var snippet = content.Substring(start, length);

        foreach (var term in terms)
        {
            var pattern = $@"\b{Regex.Escape(term)}\b";
            snippet = Regex.Replace(snippet, pattern, $"<mark>{term}</mark>", RegexOptions.IgnoreCase);
        }

        return snippet + (start + length < content.Length ? "..." : "");
    }

    private Task<List<SearchHit>> ApplyCrossEncoderReranking(string query, List<SearchHit> hits)
    {
        try
        {
            // Placeholder for cross-encoder reranking
            // In a real implementation, this would use a cross-encoder model to score query-document pairs
            _logger.LogInformation("Cross-encoder reranking requested for {Count} hits", hits.Count);
            
            // For now, return the hits as-is (cross-encoder implementation would require ML model)
            // Future enhancement: Use a cross-encoder model like ms-marco-MiniLM-L-6-v2 for reranking
            return Task.FromResult(hits);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cross-encoder reranking failed, returning original results");
            return Task.FromResult(hits);
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
