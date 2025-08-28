using Microsoft.AspNetCore.Mvc;
using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Security;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Controllers;

/// <summary>
/// Adaptive Cards generation for Microsoft Teams/UI integration
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class CardsController : ControllerBase
{
    private readonly CortexDbContext _db;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<CardsController> _logger;

    public CardsController(
        CortexDbContext db,
        IUserContextAccessor userContext,
        ILogger<CardsController> logger)
    {
        _db = db;
        _userContext = userContext;
        _logger = logger;
    }

    /// <summary>
    /// Generate card showing list of recent notes for user
    /// </summary>
    [HttpPost("list-notes")]
    public async Task<IActionResult> ListNotesCard()
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        _logger.LogInformation("Generating list-notes card for user {UserId}", _userContext.UserId);

        try
        {
            var items = await _db.Notes
                .Where(n => !n.IsDeleted && n.UserId == _userContext.UserId)
                .OrderByDescending(n => n.UpdatedAt)
                .Take(20)
                .Select(n => new { n.Id, n.Title, n.UpdatedAt })
                .ToListAsync();

            var card = new
            {
                type = "AdaptiveCard",
                version = "1.6",
                body = new object[]
                {
                    new { type = "TextBlock", text = "Recent Notes", weight = "Bolder", size = "Medium" },
                    new { 
                        type = "Container", 
                        items = items.Select(i => (object)new { 
                            type = "TextBlock", 
                            text = $"• {i.Title} ({i.Id[..8]})", 
                            wrap = true 
                        }).ToArray()
                    }
                }
            };

            _logger.LogInformation("Generated list-notes card with {ItemCount} items for user {UserId}", 
                items.Count, _userContext.UserId);

            return Ok(card);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating list-notes card for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to generate card" });
        }
    }

    /// <summary>
    /// Generate card for a specific note
    /// </summary>
    [HttpPost("note/{id}")]
    public async Task<IActionResult> NoteCard(string id)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        _logger.LogInformation("Generating note card for {NoteId}, user {UserId}", id, _userContext.UserId);

        try
        {
            var note = await _db.Notes
                .Include(n => n.Chunks)
                .FirstOrDefaultAsync(n => n.Id == id && n.UserId == _userContext.UserId);

            if (note == null)
            {
                _logger.LogWarning("Note {NoteId} not found for user {UserId}", id, _userContext.UserId);
                return NotFound();
            }

            var preview = string.Join("\n\n", note.Chunks
                .OrderBy(c => c.ChunkIndex)
                .Select(c => c.Content.Length > 400 ? c.Content.Substring(0, 400) + "…" : c.Content)
                .Take(3));

            var card = new
            {
                type = "AdaptiveCard",
                version = "1.6",
                body = new object[]
                {
                    new { type = "TextBlock", text = note.Title, weight = "Bolder", size = "Large" },
                    new { type = "TextBlock", text = preview, wrap = true }
                }
            };

            _logger.LogInformation("Generated note card for {NoteId}, user {UserId}", id, _userContext.UserId);

            return Ok(card);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating note card for {NoteId}, user {UserId}", id, _userContext.UserId);
            return StatusCode(500, new { error = "Failed to generate card" });
        }
    }

    /// <summary>
    /// Generate confirmation card for destructive operations
    /// </summary>
    [HttpPost("confirm-delete")]
    public IActionResult ConfirmDeleteCard([FromQuery] string action = "Delete")
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        _logger.LogInformation("Generating confirm-delete card for action '{Action}', user {UserId}", 
            action, _userContext.UserId);

        var card = new
        {
            type = "AdaptiveCard",
            version = "1.6",
            body = new object[]
            {
                new { type = "TextBlock", text = $"Confirm {action}", weight = "Bolder", size = "Medium" },
                new { type = "TextBlock", text = "This action cannot be undone.", wrap = true }
            },
            actions = new object[]
            {
                new { type = "Action.Submit", title = "Confirm", data = new { confirm = true } },
                new { type = "Action.Submit", title = "Cancel", data = new { confirm = false } }
            }
        };

        return Ok(card);
    }
}
