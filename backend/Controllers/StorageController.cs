using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Security;
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
        private readonly IConfiguration _config;
        private readonly IUserContextAccessor _user;
        private readonly ILogger<StorageController> _logger;
        private readonly HttpClient _http;

        private const long MaxSizeBytes = 100L * 1024 * 1024; // 100MB

        public StorageController(CortexDbContext db, IConfiguration config, IUserContextAccessor user, ILogger<StorageController> logger, HttpClient http)
        {
            _db = db;
            _config = config;
            _user = user;
            _logger = logger;
            _http = http;
        }

        [HttpPost("upload")] // single or batch via multipart
        [RequestSizeLimit(MaxSizeBytes * 10)] // allow some headroom for batch
        public async Task<IActionResult> Upload([FromForm] IFormFileCollection files, CancellationToken ct)
        {
            if (files == null || files.Count == 0)
                return BadRequest("No files provided");

            var storageRoot = _config["Storage:Root"] ?? Path.Combine(AppContext.BaseDirectory, "storage");
            var publicBase = _config["Storage:PublicBaseUrl"]; // optional, fallback to /storage
            Directory.CreateDirectory(storageRoot);

            var results = new List<StoredFileResponse>();
            foreach (var file in files)
            {
                try
                {
                    if (file.Length == 0) { continue; }
                    if (file.Length > MaxSizeBytes)
                    {
                        return BadRequest(new { error = $"File '{file.FileName}' exceeds 100MB limit" });
                    }

                    var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                    var now = DateTime.UtcNow;
                    var userDir = Path.Combine(storageRoot, _user.UserId, now.ToString("yyyy"), now.ToString("MM"));
                    Directory.CreateDirectory(userDir);

                    var id = Guid.NewGuid().ToString("n");
                    var storedFileName = id + ext;
                    var storedPath = Path.Combine(userDir, storedFileName);

                    using (var fs = new FileStream(storedPath, FileMode.CreateNew))
                    {
                        await file.CopyToAsync(fs, ct);
                    }

                    var relPath = Path.Combine(_user.UserId, now.ToString("yyyy"), now.ToString("MM"), storedFileName)
                        .Replace("\\", "/");

                    // Tags using OpenAI if configured; fallback to simple heuristics
                    var tags = await GenerateTagsWithOpenAiAsync(file.FileName, ext, file.Length, ct);
                    if (tags.Count == 0)
                    {
                        tags = ClassifySimple(file.FileName, ext, file.Length);
                    }

                    var entity = new StoredFile
                    {
                        Id = id,
                        UserId = _user.UserId,
                        OriginalFileName = file.FileName,
                        StoredPath = storedPath,
                        RelativePath = relPath,
                        ContentType = file.ContentType ?? "application/octet-stream",
                        SizeBytes = file.Length,
                        Extension = ext,
                        Tags = string.Join(",", tags),
                        CreatedAt = now
                    };

                    _db.StoredFiles.Add(entity);
                    await _db.SaveChangesAsync(ct);

                    var url = ResolvePublicUrl(publicBase, relPath);
                    results.Add(new StoredFileResponse
                    {
                        Id = entity.Id,
                        FileName = entity.OriginalFileName,
                        Url = url,
                        SizeBytes = entity.SizeBytes,
                        ContentType = entity.ContentType,
                        Extension = entity.Extension,
                        Tags = tags
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to store file {File}", file?.FileName);
                    return StatusCode(500, new { error = $"Failed to store '{file?.FileName}'" });
                }
            }

            return Ok(new { files = results });
        }

        [HttpGet]
        public async Task<IActionResult> List([FromQuery] int limit = 50, [FromQuery] int offset = 0, CancellationToken ct = default)
        {
            var q = _db.StoredFiles.Where(f => f.UserId == _user.UserId)
                .OrderByDescending(f => f.CreatedAt);

            var total = await q.CountAsync(ct);
            var page = await q.Skip(offset).Take(limit).ToListAsync(ct);
            var publicBase = _config["Storage:PublicBaseUrl"]; // optional

            var items = page.Select(e => new StoredFileResponse
            {
                Id = e.Id,
                FileName = e.OriginalFileName,
                Url = ResolvePublicUrl(publicBase, e.RelativePath),
                SizeBytes = e.SizeBytes,
                ContentType = e.ContentType,
                Extension = e.Extension,
                Tags = string.IsNullOrWhiteSpace(e.Tags) ? new List<string>() : e.Tags.Split(',').ToList()
            }).ToList();

            return Ok(new { total, items });
        }

        private async Task<List<string>> GenerateTagsWithOpenAiAsync(string name, string ext, long size, CancellationToken ct)
        {
            try
            {
                var apiKey = _config["OpenAI:ApiKey"] ?? _config["OPENAI_API_KEY"];
                if (string.IsNullOrWhiteSpace(apiKey)) return new List<string>();
                var model = _config["OPENAI_MODEL"] ?? _config["OpenAI:Model"] ?? "gpt-4o-mini";

                var prompt = $@"You are a tagging assistant. Based only on file metadata, propose 3-6 short tags.
- Use lowercase, single words or kebab-case.
- Consider extension, size bucket, and common semantic hints in the name.
- Return ONLY a JSON array of strings, no commentary.

Metadata:
- name: {name}
- extension: {ext}
- size_bytes: {size}
";

                var req = new
                {
                    model,
                    messages = new object[]
                    {
                        new { role = "system", content = "You generate concise tags as a JSON array only." },
                        new { role = "user", content = prompt }
                    },
                    temperature = 0.1
                };

                using var content = new StringContent(JsonSerializer.Serialize(req), Encoding.UTF8, "application/json");
                _http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
                using var resp = await _http.PostAsync("https://api.openai.com/v1/chat/completions", content, ct);
                if (!resp.IsSuccessStatusCode)
                {
                    var body = await resp.Content.ReadAsStringAsync(ct);
                    _logger.LogWarning("OpenAI tag generation failed: {Status} {Body}", (int)resp.StatusCode, body);
                    return new List<string>();
                }

                var json = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
                var msg = json.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";

                // Try parse JSON array
                msg = msg.Trim();
                if (msg.StartsWith("["))
                {
                    var arr = JsonDocument.Parse(msg).RootElement;
                    if (arr.ValueKind == JsonValueKind.Array)
                    {
                        var tags = new List<string>();
                        foreach (var el in arr.EnumerateArray())
                        {
                            if (el.ValueKind == JsonValueKind.String)
                                tags.Add(el.GetString()!.Trim());
                        }
                        return tags.Where(t => !string.IsNullOrWhiteSpace(t)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                    }
                }

                // Fallback: comma/space separated string
                var parts = msg.Replace("\n", ",").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                return parts.Select(p => p.Trim()).Where(p => p.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "OpenAI tag generation error, falling back to heuristic");
                return new List<string>();
            }
        }

        private static List<string> ClassifySimple(string name, string ext, long size)
        {
            var tags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(ext)) tags.Add(ext.Trim('.'));
            if (size > 50 * 1024 * 1024) tags.Add("large");
            else if (size > 10 * 1024 * 1024) tags.Add("medium");
            else tags.Add("small");
            var lower = name.ToLowerInvariant();
            if (lower.Contains("invoice") || lower.Contains("receipt")) tags.Add("finance");
            if (lower.Contains("report") || lower.Contains("summary")) tags.Add("report");
            if (lower.Contains("image") || lower.Contains("photo") || lower.EndsWith(".png") || lower.EndsWith(".jpg")) tags.Add("image");
            return tags.ToList();
        }

        private string ResolvePublicUrl(string? baseUrl, string relativePath)
        {
            if (!string.IsNullOrWhiteSpace(baseUrl))
            {
                return CombineUrl(baseUrl, relativePath);
            }
            // default static mount under /storage
            return CombineUrl("/storage", relativePath);
        }

        private static string CombineUrl(string baseUrl, string relative)
        {
            if (string.IsNullOrEmpty(baseUrl)) return relative;
            if (!baseUrl.EndsWith('/')) baseUrl += "/";
            return baseUrl + relative.TrimStart('/');
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
}
