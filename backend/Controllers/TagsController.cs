using Microsoft.AspNetCore.Mvc;
using CortexApi.Models;
using CortexApi.Security;
using CortexApi.Data;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Controllers;

/// <summary>
/// Tag management operations for Stage 2
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class TagsController : ControllerBase
{
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<TagsController> _logger;
    private readonly CortexDbContext _context;

    public TagsController(
        IUserContextAccessor userContext,
        ILogger<TagsController> logger,
        CortexDbContext context)
    {
        _userContext = userContext;
        _logger = logger;
        _context = context;
    }

    /// <summary>
    /// Bulk tag operations - add or remove tags from multiple notes
    /// </summary>
    [HttpPost("bulk")]
    public async Task<IActionResult> BulkTagOperation([FromBody] BulkTagRequest request)
    {
        if (!Rbac.RequireRole(_userContext, "Editor"))
            return Forbid("Editor role required");

        if (request.NoteIds?.Any() != true)
            return BadRequest("NoteIds is required and cannot be empty");

        if (request.Add?.Any() != true && request.Remove?.Any() != true)
            return BadRequest("Either Add or Remove tags must be specified");

        if (request.NoteIds.Count > 100)
            return BadRequest("Cannot modify more than 100 notes at once");

        _logger.LogInformation("Bulk tag operation requested for {Count} notes by user {UserId}: adding {AddCount}, removing {RemoveCount}", 
            request.NoteIds.Count, _userContext.UserId, request.Add?.Count ?? 0, request.Remove?.Count ?? 0);

        try
        {
            var notes = await _context.Notes
                .Where(n => request.NoteIds.Contains(n.Id) && n.UserId == _userContext.UserId && !n.IsDeleted)
                .ToListAsync();

            if (notes.Count == 0)
                return NotFound("No valid notes found");

            var results = new List<TagOperationResult>();

            foreach (var note in notes)
            {
                try
                {
                    var currentTags = ParseTags(note.Tags);
                    var originalCount = currentTags.Count;

                    // Add new tags
                    if (request.Add?.Any() == true)
                    {
                        foreach (var tag in request.Add)
                        {
                            if (!string.IsNullOrWhiteSpace(tag) && !currentTags.Contains(tag, StringComparer.OrdinalIgnoreCase))
                            {
                                currentTags.Add(tag.Trim());
                            }
                        }
                    }

                    // Remove tags
                    if (request.Remove?.Any() == true)
                    {
                        foreach (var tag in request.Remove)
                        {
                            if (!string.IsNullOrWhiteSpace(tag))
                            {
                                currentTags.RemoveAll(t => string.Equals(t, tag.Trim(), StringComparison.OrdinalIgnoreCase));
                            }
                        }
                    }

                    // Update the note
                    note.Tags = currentTags.Any() ? string.Join(",", currentTags.Distinct()) : null;
                    note.UpdatedAt = DateTime.UtcNow;

                    results.Add(new TagOperationResult
                    {
                        NoteId = note.Id,
                        Success = true,
                        OriginalTagCount = originalCount,
                        NewTagCount = currentTags.Count,
                        Tags = currentTags.ToList()
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Tag operation failed for note {NoteId}", note.Id);
                    results.Add(new TagOperationResult
                    {
                        NoteId = note.Id,
                        Success = false,
                        Error = "Tag operation failed"
                    });
                }
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation("Bulk tag operation completed: {SuccessCount}/{TotalCount} notes processed successfully", 
                results.Count(r => r.Success), results.Count);

            return Ok(new BulkTagResponse { Results = results });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Bulk tag operation failed");
            return StatusCode(500, "Bulk tag operation failed");
        }
    }

    /// <summary>
    /// Get all unique tags for the current user
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetTags()
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        try
        {
            var notes = await _context.Notes
                .Where(n => n.UserId == _userContext.UserId && !n.IsDeleted && !string.IsNullOrEmpty(n.Tags))
                .Select(n => n.Tags)
                .ToListAsync();

            var allTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            
            foreach (var noteTagString in notes)
            {
                if (!string.IsNullOrWhiteSpace(noteTagString))
                {
                    var tags = ParseTags(noteTagString);
                    foreach (var tag in tags)
                    {
                        allTags.Add(tag);
                    }
                }
            }

            var tagCounts = new Dictionary<string, int>();
            
            // Count occurrences
            foreach (var noteTagString in notes)
            {
                if (!string.IsNullOrWhiteSpace(noteTagString))
                {
                    var tags = ParseTags(noteTagString);
                    foreach (var tag in tags)
                    {
                        tagCounts[tag] = tagCounts.GetValueOrDefault(tag, 0) + 1;
                    }
                }
            }

            var response = new TagsResponse
            {
                Tags = tagCounts.OrderByDescending(kvp => kvp.Value)
                                .Select(kvp => new TagInfo { Name = kvp.Key, Count = kvp.Value })
                                .ToList()
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get tags for user {UserId}", _userContext.UserId);
            return StatusCode(500, "Failed to retrieve tags");
        }
    }

    /// <summary>
    /// Get tags for a specific note
    /// </summary>
    [HttpGet("{noteId}")]
    public async Task<IActionResult> GetNoteTags(string noteId)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        var note = await _context.Notes
            .FirstOrDefaultAsync(n => n.Id == noteId && n.UserId == _userContext.UserId && !n.IsDeleted);

        if (note == null)
            return NotFound($"Note {noteId} not found");

        var tags = ParseTags(note.Tags);

        return Ok(new NoteTagsResponse 
        { 
            NoteId = noteId,
            Tags = tags
        });
    }

    private List<string> ParseTags(string? tagString)
    {
        if (string.IsNullOrWhiteSpace(tagString))
            return new List<string>();

        return tagString.Split(',', StringSplitOptions.RemoveEmptyEntries)
                       .Select(t => t.Trim())
                       .Where(t => !string.IsNullOrWhiteSpace(t))
                       .ToList();
    }
}
