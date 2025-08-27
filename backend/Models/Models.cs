using System.ComponentModel.DataAnnotations;

namespace CortexApi.Models;

public class Note
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    public string Title { get; set; } = string.Empty;
    
    public string OriginalPath { get; set; } = string.Empty;
    
    public string FilePath { get; set; } = string.Empty;
    
    public string FileType { get; set; } = string.Empty;
    
    public string Sha256Hash { get; set; } = string.Empty;
    
    public long FileSizeBytes { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public int ChunkCount { get; set; }
    
    public string Tags { get; set; } = string.Empty; // JSON array
    
    public virtual ICollection<NoteChunk> Chunks { get; set; } = new List<NoteChunk>();
}

public class NoteChunk
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    public string NoteId { get; set; } = string.Empty;
    
    public string Content { get; set; } = string.Empty;
    
    public int ChunkIndex { get; set; }
    
    public int TokenCount { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public virtual Note Note { get; set; } = null!;
}

public class SearchResult
{
    public string NoteId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string ChunkContent { get; set; } = string.Empty;
    public string FileType { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public double Score { get; set; }
}

public class IngestResult
{
    public string NoteId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int CountChunks { get; set; }
}

public class ChatRequest
{
    public string Prompt { get; set; } = string.Empty;
    public string Provider { get; set; } = "ollama"; // "ollama" or "openai"
}

public class VoiceTtsRequest
{
    public string Text { get; set; } = string.Empty;
}
