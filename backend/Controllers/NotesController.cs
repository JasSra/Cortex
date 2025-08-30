using Microsoft.AspNetCore.Mvc;
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
public class NotesController : ControllerBase
{
    private readonly IIngestService _ingestService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<NotesController> _logger;
    private readonly IGamificationService _gamificationService;
    private readonly IConfiguration _configuration;
    private readonly CortexApi.Data.CortexDbContext _db;

    public NotesController(
        IIngestService ingestService,
        IUserContextAccessor userContext,
        ILogger<NotesController> logger,
    IGamificationService gamificationService,
    IConfiguration configuration,
    CortexApi.Data.CortexDbContext db)
    {
        _ingestService = ingestService;
        _userContext = userContext;
        _logger = logger;
        _gamificationService = gamificationService;
        _configuration = configuration;
    _db = db;
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
    public async Task<IActionResult> GetNotes([FromQuery] int limit = 20, [FromQuery] int offset = 0)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return StatusCode(403, "Reader role required");

        _logger.LogInformation("Getting notes for user {UserId} (limit: {Limit}, offset: {Offset})", 
            _userContext.UserId, limit, offset);

        var notes = await _ingestService.GetUserNotesAsync(_userContext.UserId, limit, offset);
        return Ok(notes);
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
            // In development mode, allow requests without authentication
            var isDevelopment = _configuration.GetValue<bool>("IsDevelopment", false) || 
                               Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development";
            
            // Require authentication in non-development environments (no specific role needed)
            if (!isDevelopment && !_userContext.IsAuthenticated)
                return StatusCode(403, "Authentication required");

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
}
