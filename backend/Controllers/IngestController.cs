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

    public IngestController(
        IIngestService ingestService,
        IUserContextAccessor userContext,
        ILogger<IngestController> logger)
    {
        _ingestService = ingestService;
        _userContext = userContext;
        _logger = logger;
    }

    /// <summary>
    /// Upload and ingest multiple files (Editor role required)
    /// </summary>
    [HttpPost("files")]
    public async Task<IActionResult> IngestFiles(IFormFileCollection files)
    {
        if (!Rbac.RequireRole(_userContext, "Editor"))
            return Forbid("Editor role required");

        if (files == null || files.Count == 0)
            return BadRequest("No files provided");

        _logger.LogInformation("Ingesting {FileCount} files for user {UserId}", 
            files.Count, _userContext.UserId);

        try
        {
            var results = await _ingestService.IngestFilesAsync(files);
            
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
        if (!Rbac.RequireRole(_userContext, "Editor"))
            return Forbid("Editor role required");

        if (string.IsNullOrWhiteSpace(request.Path))
            return BadRequest("Folder path is required");

        _logger.LogInformation("Ingesting folder '{FolderPath}' for user {UserId}", 
            request.Path, _userContext.UserId);

        try
        {
            var results = await _ingestService.IngestFolderAsync(request.Path);
            
            _logger.LogInformation("Successfully ingested folder '{FolderPath}' for user {UserId}", 
                request.Path, _userContext.UserId);

            return Ok(results);
        }
        catch (UnauthorizedAccessException)
        {
            _logger.LogWarning("Unauthorized access to folder '{FolderPath}' for user {UserId}", 
                request.Path, _userContext.UserId);
            return Forbid("Access denied to specified folder");
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
