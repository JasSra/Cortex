using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Controllers;

/// <summary>
/// Note management operations - scoped per user
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotesController : ControllerBase
{
    private readonly IIngestService _ingestService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<NotesController> _logger;
    private readonly IGamificationService _gamificationService;
    private readonly CortexApi.Data.CortexDbContext _db;

    public NotesController(
        IIngestService ingestService,
        IUserContextAccessor userContext,
        ILogger<NotesController> logger,
        IGamificationService gamificationService,
        CortexApi.Data.CortexDbContext db)
    {
        _ingestService = ingestService;
        _userContext = userContext;
        _logger = logger;
        _gamificationService = gamificationService;
        _db = db;
    }

    private static string GetIndexingStatus(int chunkCount, int embeddingCount)
    {
        if (chunkCount <= 0) return "none";
        if (embeddingCount <= 0) return "none";
        if (embeddingCount < chunkCount) return "partial";
        return "complete";
    }

    /// <summary>
    /// Get a specific note by ID (Reader role required)
    /// </summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetNote(string id)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return StatusCode(403, "Reader role required");

        _logger.LogInformation("Getting note {NoteId} for user {UserId}", id, _userContext.UserId);

        var note = await _ingestService.GetNoteAsync(id);
        if (note == null)
        {
            _logger.LogWarning("Note {NoteId} not found for user {UserId}", id, _userContext.UserId);
            return NotFound();
        }

        // Ensure user can only access their own notes
        if (note.UserId != _userContext.UserId)
        {
            _logger.LogWarning("User {UserId} attempted to access note {NoteId} owned by {OwnerId}", 
                _userContext.UserId, id, note.UserId);
            return StatusCode(403, "Access denied");
        }

        return Ok(note);
    }

    /// <summary>
    /// Get all notes for the current user (Reader role required)
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetNotes([FromQuery] int limit = 20, [FromQuery] int offset = 0, [FromQuery] bool includeContent = false)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return StatusCode(403, "Reader role required");

        _logger.LogInformation("Getting notes for user {UserId} (limit: {Limit}, offset: {Offset})", 
            _userContext.UserId, limit, offset);

        var notes = await _ingestService.GetUserNotesAsync(_userContext.UserId, limit, offset);

        // Compute embedding counts in one query for all returned notes
        var noteIds = notes.Select(n => n.Id).ToList();
        var embeddingCounts = await _db.Embeddings
            .Where(e => noteIds.Contains(e.Chunk.NoteId))
            .GroupBy(e => e.Chunk.NoteId)
            .Select(g => new { NoteId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.NoteId, x => x.Count);

        var response = notes.Select(n =>
        {
            var tagsCsv = n.Tags ?? string.Empty;
            var hasTags = !string.IsNullOrWhiteSpace(tagsCsv);
            var piiCsv = n.PiiFlags ?? string.Empty;
            var secretCsv = n.SecretFlags ?? string.Empty;
            var sens = n.SensitivityLevel;
            var embeddingCount = embeddingCounts.TryGetValue(n.Id, out var c) ? c : 0;
            var coverage = n.ChunkCount > 0 ? Math.Min(1.0, Math.Max(0.0, (double)embeddingCount / Math.Max(1, n.ChunkCount))) : 0.0;
            var indexingStatus = GetIndexingStatus(n.ChunkCount, embeddingCount);
            var searchReady = embeddingCount > 0 && n.ChunkCount > 0;
            var hasPii = !string.IsNullOrWhiteSpace(piiCsv);
            var hasSecrets = !string.IsNullOrWhiteSpace(secretCsv);
            var classified = hasTags || !string.IsNullOrWhiteSpace(n.Summary) || sens > 0 || hasPii || hasSecrets;
            var redactionRequired = sens > 0 || hasPii || hasSecrets;

            // Compute preview string for list views
            var preview = string.IsNullOrEmpty(n.Content) ? string.Empty : (n.Content.Length > 500 ? n.Content.Substring(0, 500) + "…" : n.Content);

            // Return a superset object: include Content only when requested, always provide Preview
            return new
            {
                n.Id,
                n.Title,
                Content = includeContent ? n.Content : string.Empty,
                Preview = preview,
                n.UserId,
                n.Lang,
                n.Source,
                n.IsDeleted,
                n.Version,
                n.SensitivityLevel,
                n.PiiFlags,
                n.SecretFlags,
                n.Summary,
                n.OriginalPath,
                n.FilePath,
                n.FileType,
                n.Sha256Hash,
                n.FileSizeBytes,
                n.CreatedAt,
                n.UpdatedAt,
                n.ChunkCount,
                Tags = tagsCsv,
                Status = new
                {
                    ChunkCount = n.ChunkCount,
                    EmbeddingCount = embeddingCount,
                    EmbeddingCoverage = coverage,
                    IndexingStatus = indexingStatus, // none|partial|complete
                    SearchReady = searchReady,
                    Tagged = hasTags,
                    Classified = classified,
                    RedactionRequired = redactionRequired,
                    HasPii = hasPii,
                    HasSecrets = hasSecrets,
                    SensitivityLevel = sens,
                }
            };
        });

        return Ok(response);
    }

    /// <summary>
    /// Health check endpoint
    /// </summary>
    [HttpGet("health")]
    public IActionResult Health()
    {
        return Ok(new { status = "healthy", timestamp = DateTime.UtcNow });
    }

    /// <summary>
    /// Create a note from text content (Authenticated user required)
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateNote([FromBody] CreateNoteRequest request)
    {
        try 
        {
            if (string.IsNullOrWhiteSpace(request.Content))
                return BadRequest("Content is required");

            _logger.LogInformation("Creating note from text for user {UserId}", _userContext.UserId ?? "dev-user");

            var result = await _ingestService.IngestTextAsync(request.Title ?? string.Empty, request.Content);
            
            if (result == null)
            {
                return BadRequest("Failed to create note");
            }

            // Track note creation for gamification (only if user context is available)
            if (!string.IsNullOrEmpty(_userContext.UserId))
            {
                // Resolve actual UserProfile.Id from SubjectId
                var subjectId = _userContext.UserSubjectId ?? _userContext.UserId;
                var userProfileId = await _db.UserProfiles
                    .Where(up => up.SubjectId == subjectId)
                    .Select(up => up.Id)
                    .FirstOrDefaultAsync();
                if (!string.IsNullOrEmpty(userProfileId))
                {
                    await _gamificationService.UpdateUserStatsAsync(userProfileId, "note_created", 1);
                    await _gamificationService.CheckAndAwardAchievementsAsync(userProfileId, "note_created");
                }
            }
            
            _logger.LogInformation("Successfully created note {NoteId} for user {UserId}", 
                result.NoteId, _userContext.UserId ?? "dev-user");

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating note for user {UserId}: {Message}", _userContext.UserId ?? "dev-user", ex.Message);
            return StatusCode(500, new { error = "Failed to create note", details = ex.Message });
        }
    }

    /// <summary>
    /// Delete a note (Editor role required + confirmation)
    /// </summary>
    [HttpDelete("{id}")]
    public IActionResult DeleteNote(string id)
    {
        if (!Rbac.RequireRole(_userContext, "Editor"))
            return StatusCode(403, "Editor role required");

        // Check for confirmation header (safety measure)
        var confirmDelete = Request.Headers["X-Confirm-Delete"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(confirmDelete) || 
            (!confirmDelete.Equals("true", StringComparison.OrdinalIgnoreCase) && confirmDelete != "1"))
        {
            return BadRequest(new { error = "ConfirmDelete required. Set X-Confirm-Delete: true" });
        }

    _logger.LogWarning("Deleting note {NoteId} for user {UserId}", id, _userContext.UserId);

    // Implementation would go here - for now, return placeholder
    return Ok(new { message = "Note deletion not yet implemented", noteId = id });
    }

    /// <summary>
    /// Update an existing note's title/content and retrigger classification + embeddings (Editor role required)
    /// </summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateNote(string id, [FromBody] UpdateNoteRequest request)
    {
        if (!Rbac.RequireRole(_userContext, "Editor"))
            return StatusCode(403, "Editor role required");

        if (request is null || string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { error = "Content is required" });

        try
        {
            var result = await _ingestService.UpdateNoteAsync(id, request.Title ?? string.Empty, request.Content, request.SkipProcessing);
            if (result is null) return NotFound(new { error = "Note not found" });
            return Ok(new { noteId = result.NoteId, title = result.Title, countChunks = result.CountChunks });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating note {NoteId} for user {UserId}", id, _userContext.UserId);
            return StatusCode(500, new { error = "Failed to update note" });
        }
    }
}

public class UpdateNoteRequest
{
    public string? Title { get; set; }
    public string Content { get; set; } = string.Empty;
    /// <summary>
    /// When true, performs a lightweight update (skip re-chunking, embeddings, classification).
    /// Use for autosave to avoid heavy processing on every keystroke.
    /// </summary>
    public bool SkipProcessing { get; set; } = false;
}
