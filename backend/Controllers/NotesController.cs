using Microsoft.AspNetCore.Mvc;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;

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

    public NotesController(
        IIngestService ingestService,
        IUserContextAccessor userContext,
        ILogger<NotesController> logger,
        IGamificationService gamificationService)
    {
        _ingestService = ingestService;
        _userContext = userContext;
        _logger = logger;
        _gamificationService = gamificationService;
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
    /// Delete a note (Editor role required + confirmation)
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteNote(string id)
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
