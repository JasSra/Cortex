using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Text;
using System.Text.Json;

namespace CortexApi.Services;

/// <summary>
/// Implementation of file storage service that abstracts common file operations
/// </summary>
public class FileStorageService : IFileStorageService
{
    private readonly CortexDbContext _db;
    private readonly IConfigurationService _configurationService;
    private readonly IUserContextAccessor _user;
    private readonly ILogger<FileStorageService> _logger;
    private readonly HttpClient _http;

    private const long MaxSizeBytes = 100L * 1024 * 1024; // 100MB

    public FileStorageService(
        CortexDbContext db, 
        IConfigurationService configurationService, 
        IUserContextAccessor user, 
        ILogger<FileStorageService> logger, 
        HttpClient http)
    {
        _db = db;
        _configurationService = configurationService;
        _user = user;
        _logger = logger;
        _http = http;
    }

    public async Task<StoredFile> StoreFileAsync(IFormFile file, CancellationToken ct = default)
    {
        if (file.Length == 0)
            throw new ArgumentException("File is empty", nameof(file));

        if (file.Length > MaxSizeBytes)
            throw new ArgumentException($"File '{file.FileName}' exceeds 100MB limit", nameof(file));

        var config = _configurationService.GetConfiguration();
        var storageRoot = config["Storage:Root"] ?? Path.Combine(AppContext.BaseDirectory, "storage");
        Directory.CreateDirectory(storageRoot);

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

        // Generate tags using OpenAI if configured; fallback to simple heuristics
        var tags = await GenerateFileTagsAsync(file.FileName, ext, file.Length, ct);

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

        _logger.LogInformation("Stored file {FileName} with ID {FileId} for user {UserId}", 
            file.FileName, id, _user.UserId);

        return entity;
    }

    public async Task<bool> DeleteStoredFileAsync(string fileId, CancellationToken ct = default)
    {
        var entity = await _db.StoredFiles.FirstOrDefaultAsync(f => f.Id == fileId && f.UserId == _user.UserId, ct);
        if (entity == null)
        {
            _logger.LogWarning("Stored file {FileId} not found for user {UserId}", fileId, _user.UserId);
            return false;
        }

        try
        {
            if (File.Exists(entity.StoredPath))
            {
                File.Delete(entity.StoredPath);
                _logger.LogInformation("Deleted file from disk: {Path}", entity.StoredPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete file from disk: {Path}", entity.StoredPath);
        }

        _db.StoredFiles.Remove(entity);
        await _db.SaveChangesAsync(ct);
        
        _logger.LogInformation("Deleted stored file {FileId} for user {UserId}", fileId, _user.UserId);
        return true;
    }

    public async Task<StoredFile?> GetStoredFileAsync(string fileId, CancellationToken ct = default)
    {
        return await _db.StoredFiles.FirstOrDefaultAsync(f => f.Id == fileId && f.UserId == _user.UserId, ct);
    }

    public async Task<(int total, List<StoredFile> items)> GetUserStoredFilesAsync(string userId, int limit = 50, int offset = 0, CancellationToken ct = default)
    {
        var query = _db.StoredFiles.Where(f => f.UserId == userId)
            .OrderByDescending(f => f.CreatedAt);

        var total = await query.CountAsync(ct);
        var items = await query.Skip(offset).Take(limit).ToListAsync(ct);

        return (total, items);
    }

    public async Task<List<string>> GenerateFileTagsAsync(string fileName, string extension, long sizeBytes, CancellationToken ct = default)
    {
        try
        {
            var config = _configurationService.GetConfiguration();
            var apiKey = config["OpenAI:ApiKey"] ?? config["OPENAI_API_KEY"];
            if (string.IsNullOrWhiteSpace(apiKey)) 
                return ClassifySimple(fileName, extension, sizeBytes);

            var model = config["OPENAI_MODEL"] ?? config["OpenAI:Model"] ?? "gpt-4o-mini";

            var prompt = $@"You are a tagging assistant. Based only on file metadata, propose 3-6 short tags.
- Use lowercase, single words or kebab-case.
- Consider extension, size bucket, and common semantic hints in the name.
- Return ONLY a JSON array of strings, no commentary.

Metadata:
- name: {fileName}
- extension: {extension}
- size_bytes: {sizeBytes}
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
                return ClassifySimple(fileName, extension, sizeBytes);
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
            return ClassifySimple(fileName, extension, sizeBytes);
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
}
