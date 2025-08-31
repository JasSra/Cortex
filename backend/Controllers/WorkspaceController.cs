using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Security;
using System.Text.Json;

namespace CortexApi.Controllers;

/// <summary>
/// API for managing user workspace state, recent notes, and editor preferences
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class WorkspaceController : ControllerBase
{
    private readonly CortexDbContext _context;
    private readonly IUserContextAccessor _userContext;

    public WorkspaceController(CortexDbContext context, IUserContextAccessor userContext)
    {
        _context = context;
        _userContext = userContext;
    }

    /// <summary>
    /// Get the user's workspace state
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<UserWorkspace>> GetWorkspace()
    {
        var userId = _userContext.UserId;
        
        var workspace = await _context.UserWorkspaces
            .Include(w => w.ActiveNote)
            .FirstOrDefaultAsync(w => w.UserId == userId);

        if (workspace == null)
        {
            // Create default workspace for user
            workspace = new UserWorkspace
            {
                UserId = userId,
                RecentNoteIds = "[]",
                EditorState = "{}",
                PinnedTags = "[]",
                LayoutPreferences = "{\"sidebarWidth\": 300, \"editorTheme\": \"vs-dark\"}"
            };
            
            _context.UserWorkspaces.Add(workspace);
            await _context.SaveChangesAsync();
        }

        return Ok(workspace);
    }

    /// <summary>
    /// Update the user's workspace state
    /// </summary>
    [HttpPut]
    public async Task<ActionResult<UserWorkspace>> UpdateWorkspace([FromBody] UpdateWorkspaceRequest request)
    {
        var userId = _userContext.UserId;
        
        var workspace = await _context.UserWorkspaces
            .FirstOrDefaultAsync(w => w.UserId == userId);

        if (workspace == null)
        {
            workspace = new UserWorkspace { UserId = userId };
            _context.UserWorkspaces.Add(workspace);
        }

        // Update fields that were provided
        if (!string.IsNullOrEmpty(request.ActiveNoteId))
        {
            workspace.ActiveNoteId = request.ActiveNoteId;
        }
        
        if (!string.IsNullOrEmpty(request.RecentNoteIds))
        {
            workspace.RecentNoteIds = request.RecentNoteIds;
        }
        
        if (!string.IsNullOrEmpty(request.EditorState))
        {
            workspace.EditorState = request.EditorState;
        }
        
        if (!string.IsNullOrEmpty(request.PinnedTags))
        {
            workspace.PinnedTags = request.PinnedTags;
        }
        
        if (!string.IsNullOrEmpty(request.LayoutPreferences))
        {
            workspace.LayoutPreferences = request.LayoutPreferences;
        }

        workspace.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // Return updated workspace with active note
        return await GetWorkspace();
    }

    /// <summary>
    /// Get recent notes accessed by the user
    /// </summary>
    [HttpGet("recent-notes")]
    public async Task<ActionResult<List<NoteMeta>>> GetRecentNotes([FromQuery] int limit = 10)
    {
        var userId = _userContext.UserId;
        
        var recentAccess = await _context.UserNoteAccess
            .Where(a => a.UserId == userId)
            .OrderByDescending(a => a.AccessedAt)
            .Take(limit)
            .Include(a => a.Note)
            .ToListAsync();

        var recentNotes = recentAccess
            .Where(a => a.Note != null && !a.Note.IsDeleted)
            .Select(a => new NoteMeta
            {
                Id = a.Note.Id,
                Title = a.Note.Title,
                CreatedAt = a.Note.CreatedAt,
                UpdatedAt = a.Note.UpdatedAt,
                FileType = a.Note.FileType,
                SensitivityLevel = a.Note.SensitivityLevel,
                ChunkCount = a.Note.ChunkCount,
                Tags = ParseTags(a.Note.Tags)
            })
            .ToList();

        return Ok(recentNotes);
    }

    /// <summary>
    /// Track that a user accessed a note (for recent notes functionality)
    /// </summary>
    [HttpPost("track-access")]
    public async Task<ActionResult> TrackNoteAccess([FromBody] TrackAccessRequest request)
    {
        var userId = _userContext.UserId;
        
        // Verify the note exists and belongs to the user
        var note = await _context.Notes
            .FirstOrDefaultAsync(n => n.Id == request.NoteId && n.UserId == userId);
            
        if (note == null)
        {
            return NotFound("Note not found");
        }

        // Record the access
        var access = new UserNoteAccess
        {
            UserId = userId,
            NoteId = request.NoteId,
            AccessType = request.AccessType ?? "view",
            DurationSeconds = request.DurationSeconds,
            EditorStateSnapshot = request.EditorStateSnapshot,
            AccessedAt = DateTime.UtcNow
        };

        _context.UserNoteAccess.Add(access);

        // Update workspace active note
        var workspace = await _context.UserWorkspaces
            .FirstOrDefaultAsync(w => w.UserId == userId);
            
        if (workspace != null)
        {
            workspace.ActiveNoteId = request.NoteId;
            workspace.UpdatedAt = DateTime.UtcNow;
            
            // Update recent notes list
            var recentNotes = ParseRecentNotes(workspace.RecentNoteIds);
            recentNotes.RemoveAll(id => id == request.NoteId); // Remove if already exists
            recentNotes.Insert(0, request.NoteId); // Add to front
            
            // Keep only last 20 recent notes
            if (recentNotes.Count > 20)
            {
                recentNotes = recentNotes.Take(20).ToList();
            }
            
            workspace.RecentNoteIds = JsonSerializer.Serialize(recentNotes);
        }

        await _context.SaveChangesAsync();
        return Ok();
    }

    /// <summary>
    /// Get notes filtered by tags (for tag-driven sidebar)
    /// </summary>
    [HttpGet("notes-by-tags")]
    public async Task<ActionResult<List<NoteMeta>>> GetNotesByTags([FromQuery] string tags)
    {
        var userId = _userContext.UserId;
        
        if (string.IsNullOrEmpty(tags))
        {
            return BadRequest("Tags parameter is required");
        }

        var tagList = tags.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim())
            .ToList();

        var notes = await _context.Notes
            .Where(n => n.UserId == userId && !n.IsDeleted)
            .ToListAsync();

        // Filter notes that contain any of the requested tags
        var filteredNotes = notes
            .Where(n => 
            {
                var noteTags = ParseTags(n.Tags);
                return tagList.Any(tag => noteTags.Contains(tag, StringComparer.OrdinalIgnoreCase));
            })
            .OrderByDescending(n => n.UpdatedAt)
            .Take(50)
            .Select(n => new NoteMeta
            {
                Id = n.Id,
                Title = n.Title,
                CreatedAt = n.CreatedAt,
                UpdatedAt = n.UpdatedAt,
                FileType = n.FileType,
                SensitivityLevel = n.SensitivityLevel,
                ChunkCount = n.ChunkCount,
                Tags = ParseTags(n.Tags)
            })
            .ToList();

        return Ok(filteredNotes);
    }

    /// <summary>
    /// Get all unique tags used by the user (for tag suggestions)
    /// </summary>
    [HttpGet("tags")]
    public async Task<ActionResult<List<string>>> GetAllTags()
    {
        var userId = _userContext.UserId;
        
        var notes = await _context.Notes
            .Where(n => n.UserId == userId && !n.IsDeleted && !string.IsNullOrEmpty(n.Tags))
            .Select(n => n.Tags)
            .ToListAsync();

        var allTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        
        foreach (var tagJson in notes)
        {
            var tags = ParseTags(tagJson);
            foreach (var tag in tags)
            {
                allTags.Add(tag);
            }
        }

        return Ok(allTags.OrderBy(t => t).ToList());
    }

    private List<string> ParseTags(string tagsJson)
    {
        if (string.IsNullOrEmpty(tagsJson))
            return new List<string>();
            
        try
        {
            return JsonSerializer.Deserialize<List<string>>(tagsJson) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    private List<string> ParseRecentNotes(string recentNotesJson)
    {
        if (string.IsNullOrEmpty(recentNotesJson))
            return new List<string>();
            
        try
        {
            return JsonSerializer.Deserialize<List<string>>(recentNotesJson) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }
}

// Request models
public class UpdateWorkspaceRequest
{
    public string? ActiveNoteId { get; set; }
    public string? RecentNoteIds { get; set; }
    public string? EditorState { get; set; }
    public string? PinnedTags { get; set; }
    public string? LayoutPreferences { get; set; }
}

public class TrackAccessRequest
{
    public string NoteId { get; set; } = string.Empty;
    public string? AccessType { get; set; } = "view";
    public int DurationSeconds { get; set; }
    public string? EditorStateSnapshot { get; set; }
}
