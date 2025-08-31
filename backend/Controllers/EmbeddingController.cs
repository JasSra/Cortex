using System.Text.Json;
using CortexApi.Data;
using CortexApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EmbeddingController : ControllerBase
{
    private readonly IEmbeddingService _embedding;
    private readonly IVectorService _vector;
    private readonly CortexDbContext _db;
    private readonly IBackgroundJobService _jobs;
    private readonly ILogger<EmbeddingController> _logger;

    public EmbeddingController(IEmbeddingService embedding, IVectorService vector, CortexDbContext db, IBackgroundJobService jobs, ILogger<EmbeddingController> logger)
    {
        _embedding = embedding;
        _vector = vector;
        _db = db;
        _jobs = jobs;
        _logger = logger;
    }

    // POST /api/Embedding/test { text?: string }
    [HttpPost("test")]
    public async Task<IActionResult> Test([FromBody] JsonElement body)
    {
        var text = body.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String
            ? t.GetString() ?? "hello world"
            : "hello world";

        var vec = await _embedding.EmbedAsync(text);
        if (vec == null)
            return StatusCode(503, new { ok = false, error = "Embedding failed" });

        return Ok(new { ok = true, dim = vec.Length, sample = vec.Take(8).ToArray() });
    }

    // POST /api/Embedding/requeue-missing
    // Enqueue embedding jobs for chunks that have no embeddings
    [HttpPost("requeue-missing")]
    public async Task<IActionResult> RequeueMissing()
    {
        var missing = await (
            from ch in _db.NoteChunks.AsNoTracking()
            join em in _db.Embeddings.AsNoTracking() on ch.Id equals em.ChunkId into gj
            from em in gj.DefaultIfEmpty()
            where em == null
            select new { ch.Id, ch.NoteId }
        ).Take(500).ToListAsync();

        int enq = 0;
        foreach (var m in missing)
        {
            await _jobs.EnqueueJobAsync("embedding", new EmbeddingJobPayload { ChunkId = m.Id });
            enq++;
        }
        _logger.LogInformation("Re-enqueued {Count} missing embedding jobs", enq);
        return Ok(new { ok = true, enqueued = enq });
    }
}
