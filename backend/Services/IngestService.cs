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

using PathIO = System.IO.Path;

namespace CortexApi.Services;

public interface IIngestService
{
    Task<List<IngestResult>> IngestFilesAsync(IFormFileCollection files);
    Task<List<IngestResult>> IngestFolderAsync(string folderPath);
    Task<Note?> GetNoteAsync(string noteId);
}

public class IngestService : IIngestService
{
    private readonly CortexDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ILogger<IngestService> _logger;
    private readonly string _dataDir;

    public IngestService(CortexDbContext context, IConfiguration configuration, ILogger<IngestService> logger)
    {
        _context = context;
        _configuration = configuration;
        _logger = logger;
        _dataDir = _configuration["DATA_DIR"] ?? "/app/data";
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

    public async Task<Note?> GetNoteAsync(string noteId)
    {
        return await _context.Notes
            .Include(n => n.Chunks.OrderBy(c => c.ChunkIndex))
            .FirstOrDefaultAsync(n => n.Id == noteId);
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
            Title = PathIO.GetFileNameWithoutExtension(file.FileName),
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

        _context.Notes.Add(note);
        await _context.SaveChangesAsync();

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
            Title = PathIO.GetFileNameWithoutExtension(fileInfo.Name),
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

        _context.Notes.Add(note);
        await _context.SaveChangesAsync();

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
                    ChunkIndex = chunkIndex++,
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
                    ChunkIndex = chunkIndex++,
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
                ChunkIndex = chunkIndex,
                TokenCount = currentTokenCount
            });
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
}
