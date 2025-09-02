using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO;
using System.Web;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using iTextSharp.text.pdf;
using iTextSharp.text.pdf.parser;
using Markdig;
using CortexApi.Models;
using CortexApi.Data;
using Microsoft.EntityFrameworkCore;
using CortexApi.Security;

using PathIO = System.IO.Path;

namespace CortexApi.Services;

public interface IIngestService
{
    Task<List<IngestResult>> IngestFilesAsync(IFormFileCollection files);
    Task<List<IngestResult>> IngestFolderAsync(string folderPath);
    Task<IngestResult?> IngestTextAsync(string title, string content);
    Task<Note?> GetNoteAsync(string noteId);
    Task<List<Note>> GetUserNotesAsync(string userId, int limit = 20, int offset = 0);
    Task<IngestResult?> UpdateNoteAsync(string noteId, string title, string content, bool skipProcessing = false);
    Task<UrlIngestResult?> IngestSingleUrlAsync(string url, string title, string content, string? finalUrl = null, string? siteName = null, string? byline = null, string? publishedTime = null);
}

public class IngestService : IIngestService
{
    private readonly CortexDbContext _context;
    private readonly IConfigurationService _configurationService;
    private readonly ILogger<IngestService> _logger;
    private readonly string _dataDir;
    private readonly IVectorService _vectorService;
    private readonly IUserContextAccessor _user;
    private readonly IPiiDetectionService _piiDetectionService;
    private readonly ISecretsDetectionService _secretsDetectionService;
    private readonly IClassificationService _classificationService;
    private readonly ISuggestionsService _suggestionsService;
    private readonly IFileStorageService _fileStorageService;

    public IngestService(
        CortexDbContext context, 
        IConfigurationService configurationService, 
        ILogger<IngestService> logger, 
        IVectorService vectorService, 
        IUserContextAccessor user,
        IPiiDetectionService piiDetectionService,
        ISecretsDetectionService secretsDetectionService,
        IClassificationService classificationService,
        ISuggestionsService suggestionsService,
        IFileStorageService fileStorageService)
    {
        _context = context;
        _configurationService = configurationService;
        _logger = logger;
        var config = _configurationService.GetConfiguration();
        _dataDir = config["DATA_DIR"] ?? "./data";
        _vectorService = vectorService;
        _user = user;
        _piiDetectionService = piiDetectionService;
        _secretsDetectionService = secretsDetectionService;
        _classificationService = classificationService;
        _suggestionsService = suggestionsService;
        _fileStorageService = fileStorageService;
    }

    public async Task<List<IngestResult>> IngestFilesAsync(IFormFileCollection files)
    {
        var results = new List<IngestResult>();

        foreach (var file in files)
        {
            try
            {
                var result = await IngestSingleFileAsync(file);
                if (result != null)
                    results.Add(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error ingesting file {FileName}", file.FileName);
            }
        }

        return results;
    }

    public async Task<List<IngestResult>> IngestFolderAsync(string folderPath)
    {
        var config = _configurationService.GetConfiguration();
        if (!config.GetValue<bool>("ALLOW_LOCAL_SCAN", false))
        {
            throw new UnauthorizedAccessException("Local folder scanning is disabled");
        }

        var results = new List<IngestResult>();
        var supportedExtensions = new[] { ".txt", ".md", ".pdf", ".docx" };

        var files = Directory.GetFiles(folderPath, "*.*", SearchOption.AllDirectories)
            .Where(f => supportedExtensions.Contains(PathIO.GetExtension(f).ToLower()));

        foreach (var filePath in files)
        {
            try
            {
                var result = await IngestFileFromPathAsync(filePath);
                if (result != null)
                    results.Add(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error ingesting file {FilePath}", filePath);
            }
        }

        return results;
    }

    public async Task<IngestResult?> IngestTextAsync(string title, string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

    // Normalize content for chunking (remove empty/whitespace-only lines)
    var normalizedForChunk = RemoveEmptyLines(content);

        // Calculate SHA-256 hash from content (normalized)
        var hash = CalculateSha256FromText(NormalizeForHash(content));

        // Check if content already exists
        var existingNote = await _context.Notes.FirstOrDefaultAsync(n => n.Sha256Hash == hash);
        if (existingNote != null)
        {
            _logger.LogInformation("Text content already exists with ID {NoteId}", existingNote.Id);
            return new IngestResult
            {
                NoteId = existingNote.Id,
                Title = existingNote.Title,
                CountChunks = existingNote.ChunkCount
            };
        }

        var now = DateTime.UtcNow;

        // Generate title suggestion if none provided
        string finalTitle = title;
        if (string.IsNullOrWhiteSpace(finalTitle))
        {
            var suggested = await _suggestionsService.SuggestNoteTitleAsync(content, null);
            finalTitle = string.IsNullOrWhiteSpace(suggested) ? $"Note {now:yyyy-MM-dd HH:mm}" : suggested.Trim();
        }

    // Create note and chunks directly from text
        var note = new Note
        {
            UserId = _user.UserId ?? "dev-user",
            Title = finalTitle,
            Content = content,
            WordCount = CalculateWordCount(content),
            OriginalPath = "text-input",
            FilePath = string.Empty,
            FileType = ".txt",
            Sha256Hash = hash,
            FileSizeBytes = Encoding.UTF8.GetByteCount(content),
            CreatedAt = now,
            UpdatedAt = now
        };

    var chunks = ChunkText(normalizedForChunk, note.Id);
        note.ChunkCount = chunks.Count;
        note.Chunks = chunks;

        // Perform auto-classification on the content
        await PerformAutoClassificationAsync(note, content);

        _context.Notes.Add(note);
        await _context.SaveChangesAsync();

        // Enqueue chunks for embedding
        foreach (var ch in chunks)
        {
            await _vectorService.EnqueueEmbedAsync(note, ch);
        }

        return new IngestResult
        {
            NoteId = note.Id,
            Title = note.Title,
            CountChunks = note.ChunkCount
        };
    }

    public async Task<Note?> GetNoteAsync(string noteId)
    {
        return await _context.Notes
            .Include(n => n.Chunks.OrderBy(c => c.ChunkIndex))
            .FirstOrDefaultAsync(n => n.Id == noteId);
    }

    public async Task<IngestResult?> UpdateNoteAsync(string noteId, string title, string content, bool skipProcessing = false)
    {
        // Note query is already scoped by user via query filter
        var note = await _context.Notes
            .Include(n => n.Chunks)
            .FirstOrDefaultAsync(n => n.Id == noteId);
        if (note == null)
        {
            _logger.LogWarning("UpdateNoteAsync: Note {NoteId} not found or not accessible for user {UserId}", noteId, _user.UserId);
            return null;
        }

        var now = DateTime.UtcNow;
        string finalTitle = title;
        if (string.IsNullOrWhiteSpace(finalTitle))
        {
            var suggested = await _suggestionsService.SuggestNoteTitleAsync(content, note.Title);
            finalTitle = string.IsNullOrWhiteSpace(suggested) ? note.Title : suggested.Trim();
        }

        note.Title = string.IsNullOrWhiteSpace(finalTitle) ? note.Title : finalTitle.Trim();
        note.Content = content;
        note.UpdatedAt = now;
        note.Source = "editor";
        note.FileType = ".txt";
        note.FileSizeBytes = Encoding.UTF8.GetByteCount(content);
        note.Sha256Hash = CalculateSha256FromText(NormalizeForHash(content));

        if (skipProcessing)
        {
            await _context.SaveChangesAsync();
            _logger.LogDebug("Lightweight update applied to note {NoteId} (skipProcessing)", note.Id);
            return new IngestResult { NoteId = note.Id, Title = note.Title, CountChunks = note.ChunkCount };
        }

        // Remove existing derived data to avoid duplication
        var existingChunks = await _context.NoteChunks.Where(c => c.NoteId == note.Id).ToListAsync();
        if (existingChunks.Count > 0)
        {
            _context.NoteChunks.RemoveRange(existingChunks);
        }
        var oldSpans = await _context.TextSpans.Where(s => s.NoteId == note.Id).ToListAsync();
        if (oldSpans.Count > 0) _context.TextSpans.RemoveRange(oldSpans);
        var oldClasses = await _context.Classifications.Where(c => c.NoteId == note.Id).ToListAsync();
        if (oldClasses.Count > 0) _context.Classifications.RemoveRange(oldClasses);

        var chunks = ChunkText(content, note.Id);
        note.ChunkCount = chunks.Count;
        note.Chunks = chunks;

        await PerformAutoClassificationAsync(note, content);

        await _context.SaveChangesAsync();

        foreach (var ch in chunks)
        {
            await _vectorService.EnqueueEmbedAsync(note, ch);
        }

        _logger.LogInformation("Updated note {NoteId} with {ChunkCount} chunks for user {UserId}", note.Id, note.ChunkCount, _user.UserId);
        return new IngestResult { NoteId = note.Id, Title = note.Title, CountChunks = note.ChunkCount };
    }

    private async Task<IngestResult?> IngestSingleFileAsync(IFormFile file)
    {
        if (file.Length == 0) return null;

        // Store the file using the shared storage service
        StoredFile? storedFile = null;
        try
        {
            storedFile = await _fileStorageService.StoreFileAsync(file);
            _logger.LogInformation("Stored file {FileName} with ID {FileId}", file.FileName, storedFile.Id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to store file {FileName}, continuing with temporary storage", file.FileName);
        }

        // Save file to data directory for processing (keep existing logic for now)
        var now = DateTime.UtcNow;
        var yearMonth = $"{now.Year:D4}/{now.Month:D2}";
        var dataPath = PathIO.Combine(_dataDir, "raw", yearMonth);
        Directory.CreateDirectory(dataPath);

        var fileName = $"{Guid.NewGuid()}{PathIO.GetExtension(file.FileName)}";
        var filePath = PathIO.Combine(dataPath, fileName);

        using (var fileStream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(fileStream);
        }

        // Extract text content
        var content = await ExtractTextAsync(filePath, file.FileName);
        if (string.IsNullOrWhiteSpace(content))
        {
            _logger.LogWarning("No text content extracted from file {FileName}", file.FileName);
            return null;
        }

        // Normalize content for chunking (remove empty/whitespace-only lines)
        var normalizedForChunk = RemoveEmptyLines(content);

        // Content-based SHA for dedupe (normalized)
        var contentHash = CalculateSha256FromText(NormalizeForHash(content));
        var baseFileName = PathIO.GetFileNameWithoutExtension(file.FileName);

        // Enhanced duplicate detection: check by content hash, filename, and similarity
        var existingNote = await FindExistingNoteAsync(contentHash, baseFileName, file.FileName);
        
        if (existingNote != null)
        {
            _logger.LogInformation("Found existing note for {FileName}, augmenting content for note {NoteId}", file.FileName, existingNote.Id);
            return await AugmentExistingNoteAsync(existingNote, content, file.FileName);
        }

        // Suggest a better title than the file name
        var suggestedTitle = await _suggestionsService.SuggestNoteTitleAsync(content, file.FileName);
        var finalTitle = string.IsNullOrWhiteSpace(suggestedTitle)
            ? baseFileName
            : suggestedTitle.Trim();

        // Create note and chunks with enhanced tagging
        var note = new Note
        {
            UserId = _user.UserId,
            Title = finalTitle,
            Content = content,
            WordCount = CalculateWordCount(content),
            OriginalPath = file.FileName,
            FilePath = filePath,
            FileType = PathIO.GetExtension(file.FileName).ToLower(),
            Sha256Hash = contentHash,
            FileSizeBytes = file.Length,
            Source = "file_upload",
            CreatedAt = now,
            UpdatedAt = now
        };

        // Link to stored file if available
        if (storedFile != null)
        {
            note.StoredFileId = storedFile.Id;
            _logger.LogInformation("Linked note {NoteId} to stored file {FileId}", note.Id, storedFile.Id);
        }

        var chunks = ChunkText(normalizedForChunk, note.Id);
        note.ChunkCount = chunks.Count;
        note.Chunks = chunks;

        // Enhanced auto-classification and tagging
        await PerformAutoClassificationAsync(note, content);
        await ApplySourceBasedTagsAsync(note, file.FileName, "file_upload");

        _context.Notes.Add(note);
        await _context.SaveChangesAsync();

        foreach (var ch in chunks)
        {
            await _vectorService.EnqueueEmbedAsync(note, ch);
        }

        return new IngestResult
        {
            NoteId = note.Id,
            Title = note.Title,
            CountChunks = note.ChunkCount
        };
    }

    private async Task<IngestResult?> IngestFileFromPathAsync(string filePath)
    {
        if (!File.Exists(filePath)) return null;

        var fileInfo = new FileInfo(filePath);

    // Extract text content
    var content = await ExtractTextAsync(filePath, fileInfo.Name);
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

    // Normalize content for chunking (remove empty/whitespace-only lines)
    var normalizedForChunk = RemoveEmptyLines(content);

        var contentHash = CalculateSha256FromText(NormalizeForHash(content));
        var existingByContent = await _context.Notes.FirstOrDefaultAsync(n => n.Sha256Hash == contentHash);
        if (existingByContent != null)
        {
            return new IngestResult
            {
                NoteId = existingByContent.Id,
                Title = existingByContent.Title,
                CountChunks = existingByContent.ChunkCount
            };
        }

        // Suggest a better title than the file name
        var suggestedTitle = await _suggestionsService.SuggestNoteTitleAsync(content, fileInfo.Name);
        var finalTitle = string.IsNullOrWhiteSpace(suggestedTitle)
            ? PathIO.GetFileNameWithoutExtension(fileInfo.Name)
            : suggestedTitle.Trim();

        var note = new Note
        {
            UserId = _user.UserId,
            Title = finalTitle,
            Content = content,
            WordCount = CalculateWordCount(content),
            OriginalPath = filePath,
            FilePath = filePath,
            FileType = fileInfo.Extension.ToLower(),
            Sha256Hash = contentHash,
            FileSizeBytes = fileInfo.Length,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

    var chunks = ChunkText(normalizedForChunk, note.Id);
        note.ChunkCount = chunks.Count;
        note.Chunks = chunks;

        await PerformAutoClassificationAsync(note, content);

        _context.Notes.Add(note);
        await _context.SaveChangesAsync();

        foreach (var ch in chunks)
        {
            await _vectorService.EnqueueEmbedAsync(note, ch);
        }

        return new IngestResult
        {
            NoteId = note.Id,
            Title = note.Title,
            CountChunks = note.ChunkCount
        };
    }

    private static string NormalizeForHash(string text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        // Normalize: CRLF -> LF, trim lines, collapse multiple spaces, lower-case
        var lf = text.Replace("\r\n", "\n").Replace("\r", "\n");
        var sb = new StringBuilder(lf.Length);
        bool lastWasSpace = false;
        foreach (var ch in lf)
        {
            char c = ch;
            if (char.IsWhiteSpace(c) && c != '\n') c = ' ';
            if (c == ' ')
            {
                if (lastWasSpace) continue;
                lastWasSpace = true;
            }
            else
            {
                lastWasSpace = false;
            }
            sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString().Trim();
    }

    private async Task<string> CalculateSha256Async(Stream stream)
    {
        using var sha256 = SHA256.Create();
        var hash = await Task.Run(() => sha256.ComputeHash(stream));
        return Convert.ToHexString(hash).ToLower();
    }

    private string CalculateSha256FromText(string text)
    {
        using var sha256 = SHA256.Create();
        var bytes = Encoding.UTF8.GetBytes(text);
        var hash = sha256.ComputeHash(bytes);
        return Convert.ToHexString(hash).ToLower();
    }

    private async Task<string> ExtractTextAsync(string filePath, string originalFileName)
    {
        var extension = PathIO.GetExtension(originalFileName).ToLower();

        switch (extension)
        {
            case ".txt":
                return await File.ReadAllTextAsync(filePath, Encoding.UTF8);
            case ".md":
                return await ExtractMarkdownAsync(filePath);
            case ".pdf":
                return await ExtractPdfTextAsync(filePath);
            case ".docx":
                return await ExtractDocxTextAsync(filePath);
            case ".json":
                return await ExtractJsonTextAsync(filePath);
            default:
                if (IsLikelyTextFile(filePath, out var enc))
                {
                    try
                    {
                        return await File.ReadAllTextAsync(filePath, enc ?? Encoding.UTF8);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Fallback text extraction failed for {File}", originalFileName);
                    }
                }
                return string.Empty;
        }
    }

    private async Task<string> ExtractJsonTextAsync(string filePath)
    {
        try
        {
            var jsonContent = await File.ReadAllTextAsync(filePath, Encoding.UTF8);
            
            // Try to parse and format JSON for better readability
            using var document = JsonDocument.Parse(jsonContent);
            var formatted = JsonSerializer.Serialize(document, new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            });

            // Extract meaningful text for search/analysis
            var extractedText = new StringBuilder();
            extractedText.AppendLine("JSON Document Content:");
            extractedText.AppendLine();
            
            // Add formatted JSON
            extractedText.AppendLine("Structured Data:");
            extractedText.AppendLine(formatted);
            extractedText.AppendLine();
            
            // Extract text values for better searchability
            extractedText.AppendLine("Extracted Text Values:");
            ExtractJsonTextValues(document.RootElement, extractedText, 0);
            
            return extractedText.ToString();
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse JSON file {FilePath}, treating as plain text", filePath);
            return await File.ReadAllTextAsync(filePath, Encoding.UTF8);
        }
    }

    private void ExtractJsonTextValues(JsonElement element, StringBuilder sb, int depth)
    {
        if (depth > 5) return; // Prevent infinite recursion
        
        var indent = new string(' ', depth * 2);
        
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    if (property.Value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(property.Value.GetString()))
                    {
                        sb.AppendLine($"{indent}{property.Name}: {property.Value.GetString()}");
                    }
                    else if (property.Value.ValueKind == JsonValueKind.Object || property.Value.ValueKind == JsonValueKind.Array)
                    {
                        sb.AppendLine($"{indent}{property.Name}:");
                        ExtractJsonTextValues(property.Value, sb, depth + 1);
                    }
                }
                break;
                
            case JsonValueKind.Array:
                var index = 0;
                foreach (var item in element.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(item.GetString()))
                    {
                        sb.AppendLine($"{indent}[{index}]: {item.GetString()}");
                    }
                    else if (item.ValueKind == JsonValueKind.Object || item.ValueKind == JsonValueKind.Array)
                    {
                        sb.AppendLine($"{indent}[{index}]:");
                        ExtractJsonTextValues(item, sb, depth + 1);
                    }
                    index++;
                }
                break;
                
            case JsonValueKind.String:
                var stringValue = element.GetString();
                if (!string.IsNullOrWhiteSpace(stringValue))
                {
                    sb.AppendLine($"{indent}{stringValue}");
                }
                break;
        }
    }

    private async Task<Note?> FindExistingNoteAsync(string contentHash, string baseFileName, string fullFileName)
    {
        // First check by exact content hash
        var existingByContent = await _context.Notes.FirstOrDefaultAsync(n => n.Sha256Hash == contentHash);
        if (existingByContent != null)
        {
            return existingByContent;
        }

        // Check by filename (case-insensitive)
        var existingByFilename = await _context.Notes
            .Where(n => n.OriginalPath.ToLower() == fullFileName.ToLower() || 
                       n.Title.ToLower() == baseFileName.ToLower())
            .FirstOrDefaultAsync();
        
        if (existingByFilename != null)
        {
            // Additional check: ensure content is not identical to avoid false positives
            var existingContentHash = CalculateSha256FromText(NormalizeForHash(existingByFilename.Content));
            if (existingContentHash != contentHash)
            {
                return existingByFilename; // Different content, same filename - candidate for augmentation
            }
        }

        return null;
    }

    private async Task<IngestResult> AugmentExistingNoteAsync(Note existingNote, string newContent, string sourceFileName)
    {
        _logger.LogInformation("Augmenting existing note {NoteId} with new content from {SourceFile}", 
            existingNote.Id, sourceFileName);

        var now = DateTime.UtcNow;
        
        // Create augmentation separator
        var separator = $"\n\n--- Updated from {sourceFileName} on {now:yyyy-MM-dd HH:mm:ss} ---\n\n";
        
        // Append new content to existing content
        var augmentedContent = existingNote.Content + separator + newContent;
        
        // Update note with augmented content
        existingNote.Content = augmentedContent;
        existingNote.UpdatedAt = now;
        existingNote.Sha256Hash = CalculateSha256FromText(NormalizeForHash(augmentedContent));
        existingNote.FileSizeBytes = Encoding.UTF8.GetByteCount(augmentedContent);
        
        // Update title if it seems generic
        if (existingNote.Title.StartsWith("Note ") || existingNote.Title == PathIO.GetFileNameWithoutExtension(sourceFileName))
        {
            var suggestedTitle = await _suggestionsService.SuggestNoteTitleAsync(augmentedContent, existingNote.Title);
            if (!string.IsNullOrWhiteSpace(suggestedTitle))
            {
                existingNote.Title = suggestedTitle.Trim();
            }
        }

        // Remove existing chunks and create new ones with augmented content
        var existingChunks = await _context.NoteChunks.Where(c => c.NoteId == existingNote.Id).ToListAsync();
        if (existingChunks.Count > 0)
        {
            _context.NoteChunks.RemoveRange(existingChunks);
        }

        var newChunks = ChunkText(augmentedContent, existingNote.Id);
        existingNote.ChunkCount = newChunks.Count;
        existingNote.Chunks = newChunks;

        // Re-run classification on augmented content
        await PerformAutoClassificationAsync(existingNote, augmentedContent);
        await ApplySourceBasedTagsAsync(existingNote, sourceFileName, "file_augmentation");

        await _context.SaveChangesAsync();

        // Enqueue new chunks for embedding
        foreach (var chunk in newChunks)
        {
            await _vectorService.EnqueueEmbedAsync(existingNote, chunk);
        }

        return new IngestResult
        {
            NoteId = existingNote.Id,
            Title = existingNote.Title,
            CountChunks = existingNote.ChunkCount,
            Status = "augmented"
        };
    }

    private Task ApplySourceBasedTagsAsync(Note note, string fileName, string sourceType)
    {
        var tags = new List<string>();
        
        // Add source type tag
        tags.Add(sourceType);
        
        // Add file extension tag
        var extension = PathIO.GetExtension(fileName).ToLower().TrimStart('.');
        if (!string.IsNullOrEmpty(extension))
        {
            tags.Add($"filetype_{extension}");
        }
        
        // Add content-based tags
        if (extension == "pdf")
        {
            tags.Add("document");
            tags.Add("pdf_content");
        }
        else if (extension == "json")
        {
            tags.Add("data");
            tags.Add("structured_data");
        }
        else if (new[] { "txt", "md" }.Contains(extension))
        {
            tags.Add("text_document");
        }
        else if (new[] { "docx", "doc" }.Contains(extension))
        {
            tags.Add("office_document");
            tags.Add("word_document");
        }

        // Add size-based tags
        if (note.FileSizeBytes > 1024 * 1024) // > 1MB
        {
            tags.Add("large_file");
        }
        else if (note.FileSizeBytes < 1024) // < 1KB
        {
            tags.Add("small_file");
        }

        // Add date-based tags
        var now = DateTime.UtcNow;
        tags.Add($"uploaded_{now:yyyy}");
        tags.Add($"uploaded_{now:yyyy_MM}");

        // Merge with existing tags
        var existingTags = string.IsNullOrEmpty(note.Tags) 
            ? new List<string>() 
            : JsonSerializer.Deserialize<List<string>>(note.Tags) ?? new List<string>();
        
        existingTags.AddRange(tags.Where(t => !existingTags.Contains(t, StringComparer.OrdinalIgnoreCase)));
        
        note.Tags = JsonSerializer.Serialize(existingTags);
        
        return Task.CompletedTask;
    }

    private async Task<string> ExtractMarkdownAsync(string filePath)
    {
        var content = await File.ReadAllTextAsync(filePath, Encoding.UTF8);
        var pipeline = new MarkdownPipelineBuilder().UseAdvancedExtensions().Build();
        var html = Markdown.ToHtml(content, pipeline);
        return content;
    }

    private async Task<string> ExtractPdfTextAsync(string filePath)
    {
        return await Task.Run(() =>
        {
            var text = new StringBuilder();
            using var reader = new PdfReader(filePath);
            for (int page = 1; page <= reader.NumberOfPages; page++)
            {
                text.Append(PdfTextExtractor.GetTextFromPage(reader, page));
                text.AppendLine();
            }
            return text.ToString();
        });
    }

    private async Task<string> ExtractDocxTextAsync(string filePath)
    {
        return await Task.Run(() =>
        {
            using var document = WordprocessingDocument.Open(filePath, false);
            var body = document.MainDocumentPart?.Document?.Body;
            return body?.InnerText ?? string.Empty;
        });
    }

    private static bool IsLikelyTextFile(string path, out Encoding? encoding)
    {
        encoding = null;
        try
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            var buffer = new byte[Math.Min(8192, (int)Math.Max(1, fs.Length))];
            var read = fs.Read(buffer, 0, buffer.Length);

            if (read >= 3 && buffer[0] == 0xEF && buffer[1] == 0xBB && buffer[2] == 0xBF)
            {
                encoding = Encoding.UTF8; return true;
            }
            if (read >= 2 && buffer[0] == 0xFF && buffer[1] == 0xFE)
            { encoding = Encoding.Unicode; return true; }
            if (read >= 2 && buffer[0] == 0xFE && buffer[1] == 0xFF)
            { encoding = Encoding.BigEndianUnicode; return true; }
            if (read >= 4 && buffer[0] == 0xFF && buffer[1] == 0xFE && buffer[2] == 0x00 && buffer[3] == 0x00)
            { encoding = Encoding.UTF32; return true; }
            if (read >= 4 && buffer[0] == 0x00 && buffer[1] == 0x00 && buffer[2] == 0xFE && buffer[3] == 0xFF)
            { encoding = new UTF32Encoding(true, true); return true; }

            int controlCount = 0;
            for (int i = 0; i < read; i++)
            {
                byte b = buffer[i];
                if (b == 0) return false;
                if ((b < 32 && b != 9 && b != 10 && b != 13) || b == 127) controlCount++;
            }
            double ratio = read == 0 ? 0 : (double)controlCount / read;
            encoding = Encoding.UTF8;
            return ratio < 0.02;
        }
        catch
        {
            encoding = null; return false;
        }
    }

    private List<NoteChunk> ChunkText(string content, string noteId)
    {
        var chunks = new List<NoteChunk>();
        var sentences = SplitIntoSentences(content);
        var currentChunk = new StringBuilder();
        var currentTokenCount = 0;
        var chunkIndex = 0;

        foreach (var sentence in sentences)
        {
            var sentenceTokenCount = EstimateTokenCount(sentence);
            if (currentTokenCount + sentenceTokenCount > 1200 && currentChunk.Length > 0)
            {
                var chunkText = currentChunk.ToString().Trim();
                if (!string.IsNullOrWhiteSpace(chunkText))
                {
                    chunks.Add(new NoteChunk
                    {
                        NoteId = noteId,
                        Content = chunkText,
                        Text = chunkText,
                        ChunkIndex = chunkIndex,
                        Seq = chunkIndex,
                        TokenCount = currentTokenCount
                    });
                    chunkIndex++;
                }
                currentChunk.Clear();
                currentTokenCount = 0;
            }

            currentChunk.AppendLine(sentence);
            currentTokenCount += sentenceTokenCount;

            if (currentTokenCount >= 1200)
            {
                var chunkText = currentChunk.ToString().Trim();
                if (!string.IsNullOrWhiteSpace(chunkText))
                {
                    chunks.Add(new NoteChunk
                    {
                        NoteId = noteId,
                        Content = chunkText,
                        Text = chunkText,
                        ChunkIndex = chunkIndex,
                        Seq = chunkIndex,
                        TokenCount = currentTokenCount
                    });
                    chunkIndex++;
                }
                currentChunk.Clear();
                currentTokenCount = 0;
            }
        }

        if (currentChunk.Length > 0)
        {
            var chunkText = currentChunk.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(chunkText))
            {
                chunks.Add(new NoteChunk
                {
                    NoteId = noteId,
                    Content = chunkText,
                    Text = chunkText,
                    ChunkIndex = chunkIndex,
                    Seq = chunkIndex,
                    TokenCount = currentTokenCount
                });
            }
        }

        // Compute sha and remove duplicate chunks by content hash (normalized)
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var deduped = new List<NoteChunk>();
        foreach (var ch in chunks)
        {
            var norm = NormalizeForHash(ch.Content);
            using var sha = SHA256.Create();
            var shaStr = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(norm))).ToLowerInvariant();
            ch.Sha256 = shaStr;
            if (seen.Add(shaStr))
            {
                deduped.Add(ch);
            }
        }
        // Reindex chunk indices
        for (int i = 0; i < deduped.Count; i++)
        {
            deduped[i].ChunkIndex = i;
            deduped[i].Seq = i;
        }

        return deduped;
    }

    private List<string> SplitIntoSentences(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return new List<string>();

        var sentences = new List<string>();
        var current = new StringBuilder();

        foreach (var line in text.Split('\n'))
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed))
            {
                // Only add current content and clear if we have accumulated content
                if (current.Length > 0)
                {
                    var accumulated = current.ToString().Trim();
                    if (!string.IsNullOrWhiteSpace(accumulated))
                    {
                        sentences.Add(accumulated);
                    }
                    current.Clear();
                }
                continue;
            }

            // Add line to current accumulator
            if (current.Length > 0)
                current.AppendLine(trimmed);
            else
                current.Append(trimmed);

            // End sentence on period, exclamation, question mark at end of line
            if (trimmed.EndsWith('.') || trimmed.EndsWith('!') || trimmed.EndsWith('?'))
            {
                var accumulated = current.ToString().Trim();
                if (!string.IsNullOrWhiteSpace(accumulated))
                {
                    sentences.Add(accumulated);
                }
                current.Clear();
            }
        }

        // Add any remaining content
        if (current.Length > 0)
        {
            var accumulated = current.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(accumulated))
            {
                sentences.Add(accumulated);
            }
        }

        // If no sentences were found but we have content, treat entire text as one sentence
        if (sentences.Count == 0 && !string.IsNullOrWhiteSpace(text))
        {
            sentences.Add(text.Trim());
        }

        return sentences.Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
    }

    private int EstimateTokenCount(string text) => Math.Max(1, text.Length / 4);

    public async Task<List<Note>> GetUserNotesAsync(string userId, int limit = 20, int offset = 0)
    {
        try
        {
            var notes = await _context.Notes
                .Where(n => !n.IsDeleted && n.UserId == userId)
                .OrderByDescending(n => n.UpdatedAt)
                .Skip(offset)
                .Take(limit)
                .ToListAsync();
            _logger.LogInformation("Retrieved {Count} notes for user {UserId}", notes.Count, userId);
            return notes;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving notes for user {UserId}", userId);
            throw;
        }
    }

    private async Task PerformAutoClassificationAsync(Note note, string content)
    {
        try
        {
            _logger.LogInformation("Starting auto-classification for note {NoteId}", note.Id);
            var classificationResult = await _classificationService.ClassifyTextAsync(content, note.Id);
            if (classificationResult.Tags.Any())
            {
                note.Tags = string.Join(",", classificationResult.Tags.Select(t => t.Name));
            }
            note.SensitivityLevel = classificationResult.SensitivityLevel;
            note.Summary = classificationResult.Summary;

            var piiDetections = await _piiDetectionService.DetectPiiAsync(content);
            var piiSpans = await _piiDetectionService.CreatePiiSpansAsync(note.Id, content);
            if (piiDetections.Any())
            {
                note.PiiFlags = string.Join(",", piiDetections.Select(p => p.Type).Distinct());
                foreach (var span in piiSpans) { _context.TextSpans.Add(span); }
            }

            var secretDetections = await _secretsDetectionService.DetectSecretsAsync(content);
            var secretSpans = await _secretsDetectionService.CreateSecretSpansAsync(note.Id, content);
            if (secretDetections.Any())
            {
                note.SecretFlags = string.Join(",", secretDetections.Select(s => s.Type).Distinct());
                foreach (var span in secretSpans) { _context.TextSpans.Add(span); }
            }

            if (secretDetections.Any(s => s.Severity == "critical") || piiDetections.Any(p => p.Confidence > 0.9))
            {
                note.SensitivityLevel = Math.Max(note.SensitivityLevel, 4);
            }
            else if (secretDetections.Any(s => s.Severity == "high") || piiDetections.Any(p => p.Confidence > 0.7))
            {
                note.SensitivityLevel = Math.Max(note.SensitivityLevel, 3);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during auto-classification for note {NoteId}", note.Id);
        }
    }

    public async Task<UrlIngestResult?> IngestSingleUrlAsync(string url, string title, string content, string? finalUrl = null, string? siteName = null, string? byline = null, string? publishedTime = null)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return new UrlIngestResult
            {
                OriginalUrl = url,
                Status = "error",
                Error = "No content provided"
            };
        }

        try
        {
            // Normalize content for chunking (remove empty/whitespace-only lines)
            var normalizedForChunk = RemoveEmptyLines(content);
            // Calculate content hash for duplicate detection
            var contentHash = CalculateSha256FromText(content);
            
            // Check for existing note by content hash or URL
            var normalizedUrl = NormalizeUrl(url);
            var urlHash = CalculateSha256FromText(normalizedUrl);
            
            var existingNote = await FindExistingNoteAsync(contentHash, url, title);
            
            if (existingNote != null)
            {
                _logger.LogInformation("Found existing note {NoteId} for URL: {Url}", existingNote.Id, url);
                
                // Augment existing note with new URL data
                var augmentResult = await AugmentExistingNoteAsync(existingNote, content, $"URL: {url}");
                
                return new UrlIngestResult
                {
                    NoteId = existingNote.Id,
                    Title = existingNote.Title,
                    CountChunks = existingNote.ChunkCount,
                    OriginalUrl = url,
                    FinalUrl = finalUrl,
                    Status = "augmented",
                    SiteName = siteName,
                    Byline = byline,
                    PublishedTime = publishedTime
                };
            }

            var now = DateTime.UtcNow;
            
            // Generate title if not provided or use suggested title
            string finalTitle = title;
            if (string.IsNullOrWhiteSpace(finalTitle))
            {
                var suggested = await _suggestionsService.SuggestNoteTitleAsync(content, new Uri(url).Host);
                finalTitle = string.IsNullOrWhiteSpace(suggested) 
                    ? $"Web Article from {new Uri(url).Host}" 
                    : suggested.Trim();
            }

            // Create note with URL-specific metadata
            var note = new Note
            {
                UserId = _user.UserId ?? "dev-user",
                Title = finalTitle,
                Content = content,
                WordCount = CalculateWordCount(content),
                OriginalPath = normalizedUrl, // Store normalized URL
                FilePath = finalUrl ?? url, // Store final URL (after redirects) in FilePath
                FileType = ".html", // Indicate this is web content
                Sha256Hash = urlHash,
                FileSizeBytes = System.Text.Encoding.UTF8.GetByteCount(content),
                Source = "url", // Mark as URL source
                CreatedAt = now,
                UpdatedAt = now
            };

            var chunks = ChunkText(normalizedForChunk, note.Id);
            note.ChunkCount = chunks.Count;
            note.Chunks = chunks;

            // Apply source-based tags for URL content
            await ApplySourceBasedTagsAsync(note, new Uri(url).Host + ".html", "url_content");

            // Perform auto-classification on the content
            await PerformAutoClassificationAsync(note, content);

            _context.Notes.Add(note);
            await _context.SaveChangesAsync();

            // Enqueue chunks for embedding
            foreach (var ch in chunks)
            {
                await _vectorService.EnqueueEmbedAsync(note, ch);
            }

            _logger.LogInformation("Successfully ingested URL {Url} as note {NoteId} with {ChunkCount} chunks", 
                url, note.Id, note.ChunkCount);

            return new UrlIngestResult
            {
                NoteId = note.Id,
                Title = note.Title,
                CountChunks = note.ChunkCount,
                OriginalUrl = url,
                FinalUrl = finalUrl,
                Status = "success",
                SiteName = siteName,
                Byline = byline,
                PublishedTime = publishedTime,
                FetchedAt = now
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ingesting URL {Url}", url);
            return new UrlIngestResult
            {
                OriginalUrl = url,
                Status = "error",
                Error = ex.Message
            };
        }
    }

    private static string RemoveEmptyLines(string content)
    {
        if (string.IsNullOrEmpty(content)) return string.Empty;
        try
        {
            var lf = content.Replace("\r\n", "\n").Replace('\r', '\n');
            var lines = lf.Split('\n');
            var filtered = lines.Where(l => !string.IsNullOrWhiteSpace(l)).Select(l => l.Trim());
            var result = string.Join("\n", filtered);
            
            // Log the transformation for debugging
            if (result.Length == 0 && content.Length > 0)
            {
                // Content was completely filtered out - this might be the issue
                // Return original content trimmed instead of empty string
                return content.Trim();
            }
            
            return result;
        }
        catch
        {
            return content.Trim();
        }
    }

    private string NormalizeUrl(string url)
    {
        try
        {
            var uri = new Uri(url);
            
            // Remove tracking parameters
            var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
            var trackingParams = new[] { "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "ref", "source" };
            
            foreach (var param in trackingParams)
            {
                query.Remove(param);
            }
            
            var builder = new UriBuilder(uri)
            {
                Query = query.ToString(),
                Fragment = string.Empty // Remove fragment
            };
            
            return builder.Uri.ToString();
        }
        catch
        {
            return url; // Return original if normalization fails
        }
    }

    /// <summary>
    /// Calculate accurate word count for text content
    /// </summary>
    private static int CalculateWordCount(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return 0;
        
        var words = content.Trim()
            .Split(new char[0], StringSplitOptions.RemoveEmptyEntries)
            .Where(word => !string.IsNullOrWhiteSpace(word))
            .ToArray();
        
        return words.Length;
    }
}
