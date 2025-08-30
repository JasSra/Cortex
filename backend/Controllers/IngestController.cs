using Microsoft.AspNetCore.Mvc;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;
using Microsoft.EntityFrameworkCore;

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
    private readonly CortexApi.Data.CortexDbContext _db;

    public IngestController(
        IIngestService ingestService,
        IUserContextAccessor userContext,
        ILogger<IngestController> logger,
    IGamificationService gamificationService,
    CortexApi.Data.CortexDbContext db)
    {
        _ingestService = ingestService;
        _userContext = userContext;
        _logger = logger;
        _gamificationService = gamificationService;
    _db = db;
    }

    private bool EnsureAuthenticated()
    {
        // Allow any authenticated user; in Development also allow unauthenticated for local testing
        if (_userContext.IsAuthenticated) return true;
        if (HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment())
        {
            return true;
        }
        return false;
    }

    /// <summary>
    /// Upload and ingest multiple files (Authenticated user required)
    /// </summary>
    [HttpPost("files")]
    public async Task<IActionResult> IngestFiles(IFormFileCollection files)
    {
        if (!EnsureAuthenticated())
            return Forbid();

        if (files == null || files.Count == 0)
            return BadRequest("No files provided");

        _logger.LogInformation("Ingesting {FileCount} files for user {UserId}", 
            files.Count, _userContext.UserId);

        try
        {
            var results = await _ingestService.IngestFilesAsync(files);

            // Track note creation for gamification (resolve real profile ID)
            var subjectId = _userContext.UserSubjectId ?? _userContext.UserId;
            var userProfileId = await _db.UserProfiles
                .Where(up => up.SubjectId == subjectId)
                .Select(up => up.Id)
                .FirstOrDefaultAsync();
            if (!string.IsNullOrEmpty(userProfileId))
            {
                await _gamificationService.UpdateUserStatsAsync(userProfileId, "note_created", files.Count);
                await _gamificationService.CheckAndAwardAchievementsAsync(userProfileId, "note_created");
            }
            
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
    /// Ingest an entire folder (Authenticated user required)
    /// </summary>
    [HttpPost("folder")]
    public async Task<IActionResult> IngestFolder([FromBody] FolderIngestRequest request)
    {
        if (!EnsureAuthenticated())
            return Forbid();

        if (string.IsNullOrWhiteSpace(request.Path))
            return BadRequest("Folder path is required");

        _logger.LogInformation("Ingesting folder '{FolderPath}' for user {UserId}", 
            request.Path, _userContext.UserId);

        try
        {
            var results = await _ingestService.IngestFolderAsync(request.Path);

            // Track note creation for gamification - assume one note per file in folder
            var subjectId = _userContext.UserSubjectId ?? _userContext.UserId;
            var userProfileId = await _db.UserProfiles
                .Where(up => up.SubjectId == subjectId)
                .Select(up => up.Id)
                .FirstOrDefaultAsync();
            if (!string.IsNullOrEmpty(userProfileId) && results != null)
            {
                int noteCount = 1;
                if (results is System.Collections.IEnumerable enumerable)
                {
                    noteCount = 0;
                    foreach (var _ in enumerable) noteCount++;
                    if (noteCount == 0) noteCount = 1;
                }
                await _gamificationService.UpdateUserStatsAsync(userProfileId, "note_created", noteCount);
                await _gamificationService.CheckAndAwardAchievementsAsync(userProfileId, "note_created");
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
