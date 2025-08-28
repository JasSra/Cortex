using System.Text;
using CortexApi.Data;
using CortexApi.Models;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Services;

public interface IRagService
{
    Task<RagAnswer> AnswerAsync(RagQueryRequest req, string userId, CancellationToken ct);
}

public class RagService : IRagService
{
    private readonly ISearchService _searchService;
    private readonly CortexDbContext _db;

    public RagService(ISearchService searchService, CortexDbContext db)
    {
        _searchService = searchService;
        _db = db;
    }

    public async Task<RagAnswer> AnswerAsync(RagQueryRequest req, string userId, CancellationToken ct)
    {
        var q = req.Messages.LastOrDefault().content ?? string.Empty;
        var sr = await _searchService.SearchHybridAsync(new SearchRequest
        {
            Q = q,
            K = req.TopK,
            Filters = req.Filters,
            Alpha = req.Alpha,
            Mode = "hybrid"
        }, userId);

        var sb = new StringBuilder();
        var citations = new List<RagCitation>();
        foreach (var hit in sr.Hits)
        {
            var chunk = await _db.NoteChunks.FirstOrDefaultAsync(c => c.Id == hit.ChunkId, ct);
            if (chunk is null) continue;
            // If we have offsets, show a small highlighted region
            string contextText = chunk.Content;
            if (hit.Offsets is not null && hit.Offsets.Length == 2 && hit.Offsets[0] >= 0)
            {
                var start = Math.Max(0, hit.Offsets[0] - 80);
                var end = Math.Min(chunk.Content.Length, hit.Offsets[0] + hit.Offsets[1] + 80);
                var prefixEllipsis = start > 0 ? "…" : string.Empty;
                var suffixEllipsis = end < chunk.Content.Length ? "…" : string.Empty;
                contextText = prefixEllipsis + chunk.Content.Substring(start, end - start) + suffixEllipsis;
            }
            sb.AppendLine($"[Source {citations.Count + 1}] {hit.Title} (chunk {hit.ChunkIndex})\n{contextText}\n");
            citations.Add(new RagCitation { NoteId = hit.NoteId, ChunkId = hit.ChunkId, Offsets = hit.Offsets ?? Array.Empty<int>() });
        }

        // Simple extractive answer: return top snippets concatenated
        // A future improvement would call ChatService to generate abstractive answer
        var answer = $"Based on your question: '{q}', here are the most relevant excerpts:\n\n{sb.ToString()}";

        return new RagAnswer
        {
            Answer = answer,
            Citations = citations,
            Usage = new { prompt_tokens = 0, completion_tokens = 0 }
        };
    }
}
