using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO;
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
    Task<IngestResult?> UpdateNoteAsync(string noteId, string title, string content);
}

public class IngestService : IIngestService
{
    private readonly CortexDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ILogger<IngestService> _logger;
    private readonly string _dataDir;
    private readonly IVectorService _vectorService;
    private readonly IUserContextAccessor _user;
    private readonly IPiiDetectionService _piiDetectionService;
    private readonly ISecretsDetectionService _secretsDetectionService;
    private readonly IClassificationService _classificationService;

    public IngestService(
        CortexDbContext context, 
        IConfiguration configuration, 
        ILogger<IngestService> logger, 
        IVectorService vectorService, 
        IUserContextAccessor user,
        IPiiDetectionService piiDetectionService,
        ISecretsDetectionService secretsDetectionService,
        IClassificationService classificationService)
    {
        _context = context;
        _configuration = configuration;
        _logger = logger;
        _dataDir = _configuration["DATA_DIR"] ?? "./data";
        _vectorService = vectorService;
        _user = user;
        _piiDetectionService = piiDetectionService;
        _secretsDetectionService = secretsDetectionService;
        _classificationService = classificationService;
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
        if (!_configuration.GetValue<bool>("ALLOW_LOCAL_SCAN", false))
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

        // Calculate SHA-256 hash from content
        var hash = CalculateSha256FromText(content);

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
        
        // Create note and chunks directly from text
        var note = new Note
        {
            UserId = _user.UserId ?? "dev-user",
            Title = string.IsNullOrWhiteSpace(title) ? $"Note {now:yyyy-MM-dd HH:mm}" : title,
            Content = content,
            OriginalPath = "text-input",
            FilePath = string.Empty,
            FileType = ".txt",
            Sha256Hash = hash,
            FileSizeBytes = Encoding.UTF8.GetByteCount(content),
            CreatedAt = now,
            UpdatedAt = now
        };

        var chunks = ChunkText(content, note.Id);
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

    public async Task<IngestResult?> UpdateNoteAsync(string noteId, string title, string content)
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
        note.Title = string.IsNullOrWhiteSpace(title) ? note.Title : title.Trim();
        note.Content = content;
        note.UpdatedAt = now;
        note.Source = "editor";
        note.FileType = ".txt";
        note.FileSizeBytes = Encoding.UTF8.GetByteCount(content);
        note.Sha256Hash = CalculateSha256FromText(content);

        // Remove existing derived data to avoid duplication
        var existingChunks = await _context.NoteChunks.Where(c => c.NoteId == note.Id).ToListAsync();
        if (existingChunks.Count > 0)
        {
            _context.NoteChunks.RemoveRange(existingChunks); // cascades to Embeddings
        }
        var oldSpans = await _context.TextSpans.Where(s => s.NoteId == note.Id).ToListAsync();
        if (oldSpans.Count > 0) _context.TextSpans.RemoveRange(oldSpans);
        var oldClasses = await _context.Classifications.Where(c => c.NoteId == note.Id).ToListAsync();
        if (oldClasses.Count > 0) _context.Classifications.RemoveRange(oldClasses);

        // Recreate chunks
        var chunks = ChunkText(content, note.Id);
        note.ChunkCount = chunks.Count;
        note.Chunks = chunks;

        // Re-run classification and span extraction
        await PerformAutoClassificationAsync(note, content);

        await _context.SaveChangesAsync();

        // Enqueue embeddings for new chunks
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

        // Calculate SHA-256 hash
        using var stream = file.OpenReadStream();
        var hash = await CalculateSha256Async(stream);

        // Check if file already exists
        var existingNote = await _context.Notes.FirstOrDefaultAsync(n => n.Sha256Hash == hash);
        if (existingNote != null)
        {
            _logger.LogInformation("File {FileName} already exists with ID {NoteId}", file.FileName, existingNote.Id);
            return new IngestResult
            {
                NoteId = existingNote.Id,
                Title = existingNote.Title,
                CountChunks = existingNote.ChunkCount
            };
        }

        // Save file to data directory
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

        // Create note and chunks
        var note = new Note
        {
            UserId = _user.UserId,
            Title = PathIO.GetFileNameWithoutExtension(file.FileName),
            Content = content, // store plain text for previews/word counts
            OriginalPath = file.FileName,
            FilePath = filePath,
            FileType = PathIO.GetExtension(file.FileName).ToLower(),
            Sha256Hash = hash,
            FileSizeBytes = file.Length,
            CreatedAt = now,
            UpdatedAt = now
        };

        var chunks = ChunkText(content, note.Id);
        note.ChunkCount = chunks.Count;
        note.Chunks = chunks;

        // Perform auto-classification on the full content
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

    private async Task<IngestResult?> IngestFileFromPathAsync(string filePath)
    {
        if (!File.Exists(filePath)) return null;

        var fileInfo = new FileInfo(filePath);
        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
        var hash = await CalculateSha256Async(stream);

        // Check if file already exists
        var existingNote = await _context.Notes.FirstOrDefaultAsync(n => n.Sha256Hash == hash);
        if (existingNote != null)
        {
            return new IngestResult
            {
                NoteId = existingNote.Id,
                Title = existingNote.Title,
                CountChunks = existingNote.ChunkCount
            };
        }

        // Extract text content
    var content = await ExtractTextAsync(filePath, fileInfo.Name);
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

    // Create note and chunks
    var note = new Note
        {
            UserId = _user.UserId,
            Title = PathIO.GetFileNameWithoutExtension(fileInfo.Name),
        Content = content, // store plain text for previews/word counts
            OriginalPath = filePath,
            FilePath = filePath,
            FileType = fileInfo.Extension.ToLower(),
            Sha256Hash = hash,
            FileSizeBytes = fileInfo.Length,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        var chunks = ChunkText(content, note.Id);
        note.ChunkCount = chunks.Count;
        note.Chunks = chunks;

        // Perform auto-classification on the full content
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

        return extension switch
        {
            ".txt" => await File.ReadAllTextAsync(filePath, Encoding.UTF8),
            ".md" => await ExtractMarkdownAsync(filePath),
            ".pdf" => await ExtractPdfTextAsync(filePath),
            ".docx" => await ExtractDocxTextAsync(filePath),
            _ => string.Empty
        };
    }

    private async Task<string> ExtractMarkdownAsync(string filePath)
    {
        var content = await File.ReadAllTextAsync(filePath, Encoding.UTF8);
        var pipeline = new MarkdownPipelineBuilder().UseAdvancedExtensions().Build();
        var html = Markdown.ToHtml(content, pipeline);
        
        // For now, return the raw markdown content
        // TODO: Consider converting HTML to plain text for better search
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
            
            // If adding this sentence would exceed the limit, save current chunk
            if (currentTokenCount + sentenceTokenCount > 1200 && currentChunk.Length > 0)
            {
                chunks.Add(new NoteChunk
                {
                    NoteId = noteId,
                    Content = currentChunk.ToString().Trim(),
                    Text = currentChunk.ToString().Trim(),
                    ChunkIndex = chunkIndex++,
                    Seq = chunkIndex-1,
                    TokenCount = currentTokenCount
                });

                currentChunk.Clear();
                currentTokenCount = 0;
            }

            currentChunk.AppendLine(sentence);
            currentTokenCount += sentenceTokenCount;

            // If this single sentence is too long, force a chunk
            if (currentTokenCount >= 1200)
            {
                chunks.Add(new NoteChunk
                {
                    NoteId = noteId,
                    Content = currentChunk.ToString().Trim(),
                    Text = currentChunk.ToString().Trim(),
                    ChunkIndex = chunkIndex++,
                    Seq = chunkIndex-1,
                    TokenCount = currentTokenCount
                });

                currentChunk.Clear();
                currentTokenCount = 0;
            }
        }

        // Add remaining content as final chunk
        if (currentChunk.Length > 0)
        {
            chunks.Add(new NoteChunk
            {
                NoteId = noteId,
                Content = currentChunk.ToString().Trim(),
                Text = currentChunk.ToString().Trim(),
                ChunkIndex = chunkIndex,
                Seq = chunkIndex,
                TokenCount = currentTokenCount
            });
        }

        // compute chunk sha256
        foreach (var ch in chunks)
        {
            using var sha = SHA256.Create();
            var bytes = Encoding.UTF8.GetBytes(ch.Content);
            ch.Sha256 = Convert.ToHexString(sha.ComputeHash(bytes)).ToLowerInvariant();
        }

        return chunks;
    }

    private List<string> SplitIntoSentences(string text)
    {
        // Simple sentence splitting - can be improved with ML models
        var sentences = new List<string>();
        var current = new StringBuilder();

        foreach (var line in text.Split('\n'))
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed))
            {
                if (current.Length > 0)
                {
                    sentences.Add(current.ToString());
                    current.Clear();
                }
                continue;
            }

            current.AppendLine(trimmed);

            // End sentence on period, exclamation, question mark followed by space or end
            if (trimmed.EndsWith('.') || trimmed.EndsWith('!') || trimmed.EndsWith('?'))
            {
                sentences.Add(current.ToString());
                current.Clear();
            }
        }

        if (current.Length > 0)
        {
            sentences.Add(current.ToString());
        }

        return sentences.Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
    }

    private int EstimateTokenCount(string text)
    {
        // Rough estimate: 1 token ≈ 4 characters
        return text.Length / 4;
    }

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

            // Run classification
            var classificationResult = await _classificationService.ClassifyTextAsync(content, note.Id);
            
            // Apply classification results to note
            if (classificationResult.Tags.Any())
            {
                note.Tags = string.Join(",", classificationResult.Tags.Select(t => t.Name));
            }
            
            note.SensitivityLevel = classificationResult.SensitivityLevel;
            note.Summary = classificationResult.Summary;

            // Run PII detection
            var piiDetections = await _piiDetectionService.DetectPiiAsync(content);
            var piiSpans = await _piiDetectionService.CreatePiiSpansAsync(note.Id, content);
            
            if (piiDetections.Any())
            {
                note.PiiFlags = string.Join(",", piiDetections.Select(p => p.Type).Distinct());
                
                // Add PII spans to context for saving
                foreach (var span in piiSpans)
                {
                    _context.TextSpans.Add(span);
                }
                
                _logger.LogInformation("Detected {Count} PII items in note {NoteId}", piiDetections.Count, note.Id);
            }

            // Run secrets detection
            var secretDetections = await _secretsDetectionService.DetectSecretsAsync(content);
            var secretSpans = await _secretsDetectionService.CreateSecretSpansAsync(note.Id, content);
            
            if (secretDetections.Any())
            {
                note.SecretFlags = string.Join(",", secretDetections.Select(s => s.Type).Distinct());
                
                // Add secret spans to context for saving
                foreach (var span in secretSpans)
                {
                    _context.TextSpans.Add(span);
                }
                
                _logger.LogInformation("Detected {Count} secrets in note {NoteId}", secretDetections.Count, note.Id);
            }

            // Update sensitivity level based on detections
            if (secretDetections.Any(s => s.Severity == "critical") || piiDetections.Any(p => p.Confidence > 0.9))
            {
                note.SensitivityLevel = Math.Max(note.SensitivityLevel, 4); // high
            }
            else if (secretDetections.Any(s => s.Severity == "high") || piiDetections.Any(p => p.Confidence > 0.7))
            {
                note.SensitivityLevel = Math.Max(note.SensitivityLevel, 3); // medium
            }

            _logger.LogInformation("Auto-classification completed for note {NoteId}: Sensitivity={Sensitivity}, Tags={Tags}, PII={PiiCount}, Secrets={SecretCount}", 
                note.Id, note.SensitivityLevel, note.Tags, piiDetections.Count, secretDetections.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during auto-classification for note {NoteId}", note.Id);
            // Don't fail the ingestion if classification fails
        }
    }
}
