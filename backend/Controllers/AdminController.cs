using Microsoft.AspNetCore.Mvc;
using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Controllers;

/// <summary>
/// Administrative operations requiring elevated privileges
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class AdminController : ControllerBase
{
    private readonly CortexDbContext _db;
    private readonly IVectorService _vectorService;
    private readonly IEmbeddingService _embeddingService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<AdminController> _logger;

    public AdminController(
        CortexDbContext db,
        IVectorService vectorService,
        IEmbeddingService embeddingService,
        IUserContextAccessor userContext,
        ILogger<AdminController> logger)
    {
        _db = db;
        _vectorService = vectorService;
        _embeddingService = embeddingService;
        _userContext = userContext;
        _logger = logger;
    }

    /// <summary>
    /// Reindex all vectors for user's notes (Admin role + confirmation required)
    /// </summary>
    [HttpPost("reindex")]
    public async Task<IActionResult> Reindex()
    {
        if (!Rbac.RequireRole(_userContext, "Admin"))
            return Forbid("Admin role required");

        if (!ConfirmDeleteRequired())
            return BadRequest(new { error = "ConfirmDelete required. Set X-Confirm-Delete: true" });

        _logger.LogWarning("Reindexing vectors for user {UserId}", _userContext.UserId);

        try
        {
            var notes = await _db.Notes
                .Where(n => !n.IsDeleted && n.UserId == _userContext.UserId)
                .Select(n => n.Id)
                .ToListAsync();

            foreach (var noteId in notes)
            {
                await _vectorService.RemoveNoteAsync(noteId);
            }

            _logger.LogInformation("Reindex completed for user {UserId}, removed {Count} notes", 
                _userContext.UserId, notes.Count);

            return Ok(new { status = "ok", removed = notes.Count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Reindex failed for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Reindex failed", details = ex.Message });
        }
    }

    /// <summary>
    /// Re-embed all chunks for user's notes (Admin role + confirmation required)
    /// </summary>
    [HttpPost("reembed")]
    public async Task<IActionResult> Reembed()
    {
        if (!Rbac.RequireRole(_userContext, "Admin"))
            return Forbid("Admin role required");

        if (!ConfirmDeleteRequired())
            return BadRequest(new { error = "ConfirmDelete required. Set X-Confirm-Delete: true" });

        _logger.LogWarning("Re-embedding chunks for user {UserId}", _userContext.UserId);

        try
        {
            var embeddings = _db.Set<Embedding>()
                .Where(e => _db.NoteChunks.Any(c => 
                    c.Id == e.ChunkId && 
                    _db.Notes.Any(n => n.Id == c.NoteId && n.UserId == _userContext.UserId)));

            var count = await embeddings.CountAsync();
            _db.RemoveRange(embeddings);
            await _db.SaveChangesAsync();

            _logger.LogInformation("Re-embed completed for user {UserId}, removed {Count} embeddings", 
                _userContext.UserId, count);

            return Ok(new { status = "ok", removed = count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Re-embed failed for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Re-embed failed", details = ex.Message });
        }
    }

    /// <summary>
    /// Get system health and metrics (Admin role required)
    /// </summary>
    [HttpGet("health")]
    public async Task<IActionResult> GetSystemHealth()
    {
        if (!Rbac.RequireRole(_userContext, "Admin"))
            return Forbid("Admin role required");

        try
        {
            var noteCount = await _db.Notes.CountAsync(n => !n.IsDeleted && n.UserId == _userContext.UserId);
            var chunkCount = await _db.NoteChunks.CountAsync(c => 
                _db.Notes.Any(n => n.Id == c.NoteId && !n.IsDeleted && n.UserId == _userContext.UserId));
            var embeddingCount = await _db.Set<Embedding>().CountAsync(e => 
                _db.NoteChunks.Any(c => c.Id == e.ChunkId && 
                    _db.Notes.Any(n => n.Id == c.NoteId && n.UserId == _userContext.UserId)));

            var health = new
            {
                status = "healthy",
                timestamp = DateTime.UtcNow,
                userId = _userContext.UserId,
                metrics = new
                {
                    notes = noteCount,
                    chunks = chunkCount,
                    embeddings = embeddingCount
                }
            };

            return Ok(health);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Health check failed for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Health check failed", details = ex.Message });
        }
    }

    private bool ConfirmDeleteRequired()
    {
        var confirmDelete = Request.Headers["X-Confirm-Delete"].FirstOrDefault();
        return !string.IsNullOrWhiteSpace(confirmDelete) && 
               (confirmDelete.Equals("true", StringComparison.OrdinalIgnoreCase) || confirmDelete == "1");
    }

    /// <summary>
    /// Stage 2D: Reindex embeddings with scope options (all|note|since)
    /// POST /admin/embed/reindex { scope: "all|note|since", noteId?, since? }
    /// </summary>
    [HttpPost("embed/reindex")]
    public async Task<ActionResult<EmbedReindexResponse>> ReindexEmbeddings(
        [FromBody] EmbedReindexRequest request)
    {
        if (!Rbac.RequireRole(_userContext, "Admin"))
            return Forbid("Admin role required");

        try
        {
            _logger.LogInformation("Starting embedding reindex with scope: {Scope}", request.Scope);
            
            var startTime = DateTime.UtcNow;
            var processedCount = 0;
            var errorCount = 0;
            var errors = new List<string>();

            switch (request.Scope.ToLowerInvariant())
            {
                case "all":
                    (processedCount, errorCount, errors) = await ReindexAllAsync();
                    break;
                
                case "note":
                    if (string.IsNullOrEmpty(request.NoteId))
                    {
                        return BadRequest(new { error = "noteId is required for scope 'note'" });
                    }
                    (processedCount, errorCount, errors) = await ReindexNoteAsync(request.NoteId);
                    break;
                
                case "since":
                    if (request.Since == null)
                    {
                        return BadRequest(new { error = "since timestamp is required for scope 'since'" });
                    }
                    (processedCount, errorCount, errors) = await ReindexSinceAsync(request.Since.Value);
                    break;
                
                default:
                    return BadRequest(new { error = "Invalid scope. Must be 'all', 'note', or 'since'" });
            }

            var duration = DateTime.UtcNow - startTime;
            
            var response = new EmbedReindexResponse
            {
                Success = errorCount == 0,
                ProcessedCount = processedCount,
                ErrorCount = errorCount,
                Errors = errors,
                DurationMs = (int)duration.TotalMilliseconds,
                CompletedAt = DateTime.UtcNow
            };

            _logger.LogInformation("Embedding reindex completed. Processed: {ProcessedCount}, Errors: {ErrorCount}, Duration: {Duration}ms", 
                processedCount, errorCount, duration.TotalMilliseconds);

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during embedding reindex");
            return StatusCode(500, new { error = "Internal server error", details = ex.Message });
        }
    }

    /// <summary>
    /// Get embedding statistics and health status
    /// </summary>
    [HttpGet("embed/stats")]
    public async Task<ActionResult<EmbedStatsResponse>> GetEmbeddingStats()
    {
        if (!Rbac.RequireRole(_userContext, "Admin"))
            return Forbid("Admin role required");

        try
        {
            var userNotes = _db.Notes.Where(n => !n.IsDeleted && n.UserId == _userContext.UserId);
            
            var totalNotes = await userNotes.CountAsync();
            var totalChunks = await _db.NoteChunks
                .Where(c => userNotes.Any(n => n.Id == c.NoteId))
                .CountAsync();
            
            var totalEmbeddings = await _db.Embeddings
                .Where(e => _db.NoteChunks.Any(c => c.Id == e.ChunkId && 
                    userNotes.Any(n => n.Id == c.NoteId)))
                .CountAsync();
            
            var chunksWithoutEmbeddings = await _db.NoteChunks
                .Where(c => userNotes.Any(n => n.Id == c.NoteId) && !c.Embeddings.Any())
                .CountAsync();

            var newestEmbedding = await _db.Embeddings
                .Where(e => _db.NoteChunks.Any(c => c.Id == e.ChunkId && 
                    userNotes.Any(n => n.Id == c.NoteId)))
                .OrderByDescending(e => e.CreatedAt)
                .FirstOrDefaultAsync();

            var oldestEmbedding = await _db.Embeddings
                .Where(e => _db.NoteChunks.Any(c => c.Id == e.ChunkId && 
                    userNotes.Any(n => n.Id == c.NoteId)))
                .OrderBy(e => e.CreatedAt)
                .FirstOrDefaultAsync();

            var providerStats = await _db.Embeddings
                .Where(e => _db.NoteChunks.Any(c => c.Id == e.ChunkId && 
                    userNotes.Any(n => n.Id == c.NoteId)))
                .GroupBy(e => e.Provider)
                .Select(g => new { Provider = g.Key, Count = g.Count() })
                .ToListAsync();

            var modelStats = await _db.Embeddings
                .Where(e => _db.NoteChunks.Any(c => c.Id == e.ChunkId && 
                    userNotes.Any(n => n.Id == c.NoteId)))
                .GroupBy(e => e.Model)
                .Select(g => new { Model = g.Key, Count = g.Count() })
                .ToListAsync();

            return Ok(new EmbedStatsResponse
            {
                TotalNotes = totalNotes,
                TotalChunks = totalChunks,
                TotalEmbeddings = totalEmbeddings,
                ChunksWithoutEmbeddings = chunksWithoutEmbeddings,
                CoveragePercentage = totalChunks > 0 ? Math.Round((double)(totalChunks - chunksWithoutEmbeddings) / totalChunks * 100, 2) : 0,
                NewestEmbeddingAt = newestEmbedding?.CreatedAt,
                OldestEmbeddingAt = oldestEmbedding?.CreatedAt,
                ProviderBreakdown = providerStats.ToDictionary(x => x.Provider, x => x.Count),
                ModelBreakdown = modelStats.ToDictionary(x => x.Model, x => x.Count)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting embedding stats");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    private async Task<(int processed, int errors, List<string> errorMessages)> ReindexAllAsync()
    {
        var chunks = await _db.NoteChunks
            .Include(c => c.Embeddings)
            .Where(c => _db.Notes.Any(n => n.Id == c.NoteId && !n.IsDeleted && n.UserId == _userContext.UserId))
            .ToListAsync();

        return await ProcessChunksAsync(chunks);
    }

    private async Task<(int processed, int errors, List<string> errorMessages)> ReindexNoteAsync(string noteId)
    {
        var chunks = await _db.NoteChunks
            .Include(c => c.Embeddings)
            .Where(c => c.NoteId == noteId && 
                _db.Notes.Any(n => n.Id == noteId && !n.IsDeleted && n.UserId == _userContext.UserId))
            .ToListAsync();

        if (!chunks.Any())
        {
            return (0, 1, new List<string> { $"Note {noteId} not found or has no chunks" });
        }

        return await ProcessChunksAsync(chunks);
    }

    private async Task<(int processed, int errors, List<string> errorMessages)> ReindexSinceAsync(DateTime since)
    {
        var chunks = await _db.NoteChunks
            .Include(c => c.Embeddings)
            .Include(c => c.Note)
            .Where(c => (c.Note.CreatedAt >= since || c.CreatedAt >= since) && 
                !c.Note.IsDeleted && c.Note.UserId == _userContext.UserId)
            .ToListAsync();

        return await ProcessChunksAsync(chunks);
    }

    private async Task<(int processed, int errors, List<string> errorMessages)> ProcessChunksAsync(List<NoteChunk> chunks)
    {
        var processed = 0;
        var errors = 0;
        var errorMessages = new List<string>();

        // Ensure vector index exists
        try
        {
            await _vectorService.EnsureIndexAsync(_embeddingService.GetEmbeddingDim());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not ensure vector index exists");
        }

        foreach (var chunk in chunks)
        {
            try
            {
                // Remove existing embeddings for this chunk
                if (chunk.Embeddings.Any())
                {
                    _db.Embeddings.RemoveRange(chunk.Embeddings);
                }

                // Generate new embedding
                var embedding = await _embeddingService.EmbedAsync(chunk.Content);
                if (embedding != null && embedding.Length > 0)
                {
                    // Store in vector service using UpsertChunkAsync
                    await _vectorService.UpsertChunkAsync(chunk.Note, chunk, embedding);

                    // Create embedding record
                    var embeddingRecord = new Embedding
                    {
                        ChunkId = chunk.Id,
                        Provider = "openai", // Static for now
                        Model = "text-embedding-3-small", // Static for now
                        Dim = embedding.Length,
                        VectorRef = chunk.Id.ToString(), // Use chunk ID as vector reference
                        CreatedAt = DateTime.UtcNow
                    };

                    _db.Embeddings.Add(embeddingRecord);
                    processed++;
                }
                else
                {
                    errors++;
                    errorMessages.Add($"Failed to generate embedding for chunk {chunk.Id}");
                }
            }
            catch (Exception ex)
            {
                errors++;
                errorMessages.Add($"Error processing chunk {chunk.Id}: {ex.Message}");
                _logger.LogError(ex, "Error processing chunk {ChunkId}", chunk.Id);
            }
        }

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            errors++;
            errorMessages.Add($"Error saving to database: {ex.Message}");
            _logger.LogError(ex, "Error saving embedding changes to database");
        }

        return (processed, errors, errorMessages);
    }
}
