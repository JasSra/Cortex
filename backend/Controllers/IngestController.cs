using Microsoft.AspNetCore.Mvc;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;

namespace CortexApi.Controllers;

/// <summary>
/// Content ingestion operations - file uploads and folder processing
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class IngestController : ControllerBase
{
    private readonly IIngestService _ingestService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<IngestController> _logger;
    private readonly IGamificationService _gamificationService;

    public IngestController(
        IIngestService ingestService,
        IUserContextAccessor userContext,
        ILogger<IngestController> logger,
        IGamificationService gamificationService)
    {
        _ingestService = ingestService;
        _userContext = userContext;
        _logger = logger;
        _gamificationService = gamificationService;
    }

    private bool EnsureEditor()
    {
        if (_userContext.IsInRole("Editor") || _userContext.IsInRole("Admin")) return true;
        // In development, grant minimal roles on first activity to enable self-management
        if (HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment())
        {
            // UserContextAccessor has dev fallback to Admin/Editor/Reader when no roles
            return _userContext.IsInRole("Editor") || _userContext.IsInRole("Admin");
        }
        return false;
    }

    /// <summary>
    /// Upload and ingest multiple files (Editor role required)
    /// </summary>
    [HttpPost("files")]
    public async Task<IActionResult> IngestFiles(IFormFileCollection files)
    {
        if (!EnsureEditor())
            return Forbid();

        if (files == null || files.Count == 0)
            return BadRequest("No files provided");

        _logger.LogInformation("Ingesting {FileCount} files for user {UserId}", 
            files.Count, _userContext.UserId);

        try
        {
            var results = await _ingestService.IngestFilesAsync(files);
            
            // Track note creation for gamification
            var userProfileId = _userContext.UserId; // Get the actual profile ID
            await _gamificationService.UpdateUserStatsAsync(userProfileId, "note_creation", files.Count);
            await _gamificationService.CheckAndAwardAchievementsAsync(userProfileId, "note_creation");
            
            _logger.LogInformation("Successfully ingested {FileCount} files for user {UserId}", 
                files.Count, _userContext.UserId);

            return Ok(results);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ingesting files for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to ingest files", details = ex.Message });
        }
    }

    /// <summary>
    /// Ingest an entire folder (Editor role required)
    /// </summary>
    [HttpPost("folder")]
    public async Task<IActionResult> IngestFolder([FromBody] FolderIngestRequest request)
    {
        if (!EnsureEditor())
            return Forbid();

        if (string.IsNullOrWhiteSpace(request.Path))
            return BadRequest("Folder path is required");

        _logger.LogInformation("Ingesting folder '{FolderPath}' for user {UserId}", 
            request.Path, _userContext.UserId);

        try
        {
            var results = await _ingestService.IngestFolderAsync(request.Path);
            
            // Track note creation for gamification - assume one note per file in folder
            var userProfileId = _userContext.UserId; // Get the actual profile ID
            if (results != null)
            {
                var noteCount = results.GetType().GetProperty("Count")?.GetValue(results) as int? ?? 1;
                await _gamificationService.UpdateUserStatsAsync(userProfileId, "note_creation", noteCount);
                await _gamificationService.CheckAndAwardAchievementsAsync(userProfileId, "note_creation");
            }
            
            _logger.LogInformation("Successfully ingested folder '{FolderPath}' for user {UserId}", 
                request.Path, _userContext.UserId);

            return Ok(results);
        }
        catch (UnauthorizedAccessException)
        {
            _logger.LogWarning("Unauthorized access to folder '{FolderPath}' for user {UserId}", 
                request.Path, _userContext.UserId);
            return StatusCode(403, new { error = "Access denied to specified folder" });
        }
        catch (DirectoryNotFoundException)
        {
            return NotFound($"Folder not found: {request.Path}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ingesting folder '{FolderPath}' for user {UserId}", 
                request.Path, _userContext.UserId);
            return StatusCode(500, new { error = "Failed to ingest folder", details = ex.Message });
        }
    }
}

/// <summary>
/// Request model for folder ingestion
/// </summary>
public record FolderIngestRequest(string Path);
