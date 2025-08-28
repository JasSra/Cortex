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
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<AdminController> _logger;

    public AdminController(
        CortexDbContext db,
        IVectorService vectorService,
        IUserContextAccessor userContext,
        ILogger<AdminController> logger)
    {
        _db = db;
        _vectorService = vectorService;
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
}
