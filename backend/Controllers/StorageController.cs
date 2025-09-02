using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Security;
using CortexApi.Services;
using System.Text;
using System.Text.Json;

namespace CortexApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class StorageController : ControllerBase
    {
        private readonly CortexDbContext _db;
        private readonly IFileStorageService _fileStorageService;
        private readonly IUserContextAccessor _user;
        private readonly ILogger<StorageController> _logger;

        public StorageController(CortexDbContext db, IFileStorageService fileStorageService, IUserContextAccessor user, ILogger<StorageController> logger)
        {
            _db = db;
            _fileStorageService = fileStorageService;
            _user = user;
            _logger = logger;
        }

        [HttpPost("upload")] // single or batch via multipart
        [RequestSizeLimit(100L * 1024 * 1024 * 10)] // allow some headroom for batch
        [ProducesResponseType(typeof(UploadFilesResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<UploadFilesResponse>> Upload([FromForm] IFormFileCollection files, CancellationToken ct)
        {
            if (files == null || files.Count == 0)
                return BadRequest("No files provided");

            var results = new List<StoredFileResponse>();
            foreach (var file in files)
            {
                try
                {
                    if (file.Length == 0) { continue; }

                    var storedFile = await _fileStorageService.StoreFileAsync(file, ct);
                    var url = ResolveSecureUrl(storedFile.Id);
                    
                    results.Add(new StoredFileResponse
                    {
                        Id = storedFile.Id,
                        FileName = storedFile.OriginalFileName,
                        Url = url,
                        SizeBytes = storedFile.SizeBytes,
                        ContentType = storedFile.ContentType,
                        Extension = storedFile.Extension,
                        Tags = string.IsNullOrWhiteSpace(storedFile.Tags) 
                            ? new List<string>() 
                            : storedFile.Tags.Split(',').ToList()
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to store file {File}", file?.FileName);
                    return StatusCode(500, new { error = $"Failed to store '{file?.FileName}'" });
                }
            }

            return Ok(new UploadFilesResponse { Files = results });
        }

        [HttpGet]
        [ProducesResponseType(typeof(StorageListResponse), StatusCodes.Status200OK)]
        public async Task<ActionResult<StorageListResponse>> List([FromQuery] int limit = 50, [FromQuery] int offset = 0, CancellationToken ct = default)
        {
            var (total, items) = await _fileStorageService.GetUserStoredFilesAsync(_user.UserId, limit, offset, ct);

            var response = items.Select(e => new StoredFileResponse
            {
                Id = e.Id,
                FileName = e.OriginalFileName,
                Url = ResolveSecureUrl(e.Id),
                SizeBytes = e.SizeBytes,
                ContentType = e.ContentType,
                Extension = e.Extension,
                Tags = string.IsNullOrWhiteSpace(e.Tags) ? new List<string>() : e.Tags.Split(',').ToList()
            }).ToList();

            return Ok(new StorageListResponse { Total = total, Items = response });
        }

        [HttpGet("file/{id}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetFile(string id, CancellationToken ct)
        {
            var entity = await _fileStorageService.GetStoredFileAsync(id, ct);
            if (entity == null) return NotFound();

            try
            {
                var stream = System.IO.File.OpenRead(entity.StoredPath);
                return File(stream, entity.ContentType ?? "application/octet-stream", entity.OriginalFileName, enableRangeProcessing: true);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to open stored file {Path}", entity.StoredPath);
                return NotFound();
            }
        }

        [HttpDelete("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
        public async Task<IActionResult> Delete(string id, CancellationToken ct)
        {
            var success = await _fileStorageService.DeleteStoredFileAsync(id, ct);
            if (!success)
            {
                return NotFound(new { error = "File not found" });
            }

            return NoContent();
        }

        private string ResolveSecureUrl(string id)
        {
            // Default: serve via authenticated API endpoint
            return $"/api/Storage/file/{id}";
        }
    }

    public class StoredFileResponse
    {
        public string Id { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public long SizeBytes { get; set; }
        public string ContentType { get; set; } = string.Empty;
        public string Extension { get; set; } = string.Empty;
        public List<string> Tags { get; set; } = new();
    }

    public class UploadFilesResponse
    {
        public List<StoredFileResponse> Files { get; set; } = new();
    }

    public class StorageListResponse
    {
        public int Total { get; set; }
        public List<StoredFileResponse> Items { get; set; } = new();
    }
}
