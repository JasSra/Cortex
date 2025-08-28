using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace CortexApi.Models;

public class Note
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    public string Title { get; set; } = string.Empty;
    
    // Stage1 alignment fields (optional for existing ingestion flow)
    public string UserId { get; set; } = "default"; // required for filters; default single-user
    public string Content { get; set; } = string.Empty; // optional full-text (primary source is chunks)
    public string Lang { get; set; } = "en";
    public string Source { get; set; } = "ingest";
    public bool IsDeleted { get; set; }
    public int Version { get; set; } = 1;
    
    // Stage 2 fields
    public int SensitivityLevel { get; set; } = 0; // 0=Public, 1=Internal, 2=Confidential, 3=Secret
    public string PiiFlags { get; set; } = string.Empty; // JSON array of PII detection results
    public string SecretFlags { get; set; } = string.Empty; // JSON array of secret detection results  
    public string Summary { get; set; } = string.Empty; // Auto-generated summary
    
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
    public virtual ICollection<NoteTag> NoteTags { get; set; } = new List<NoteTag>();
    public virtual ICollection<Classification> Classifications { get; set; } = new List<Classification>();
    public virtual ICollection<TextSpan> Spans { get; set; } = new List<TextSpan>();
}

public class NoteChunk
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    public string NoteId { get; set; } = string.Empty;
    
    public string Content { get; set; } = string.Empty;
    
    public int ChunkIndex { get; set; }
    
    public int TokenCount { get; set; }
    
    // Stage1 alignment fields
    public int Seq { get; set; } // mirror of ChunkIndex for Stage1 naming
    public string Text { get; set; } = string.Empty; // mirror of Content
    public string Sha256 { get; set; } = string.Empty;
    
    // Stage 2 fields
    public int SensitivityLevel { get; set; } = 0; // 0=Public, 1=Internal, 2=Confidential, 3=Secret
    public string PiiFlags { get; set; } = string.Empty; // JSON array of PII detection results
    public string SecretFlags { get; set; } = string.Empty; // JSON array of secret detection results
    public string Summary { get; set; } = string.Empty; // Auto-generated summary
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public virtual Note Note { get; set; } = null!;
    public virtual ICollection<Embedding> Embeddings { get; set; } = new List<Embedding>();
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

public class SearchRequest
{
    public string Q { get; set; } = string.Empty;
    public int K { get; set; } = 10;
    public Dictionary<string, string>? Filters { get; set; }
    public string Mode { get; set; } = "hybrid"; // hybrid|semantic|bm25
    public double Alpha { get; set; } = 0.6; // weight for vector score
}

public class SearchHit
{
    public string NoteId { get; set; } = string.Empty;
    public string ChunkId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Snippet { get; set; } = string.Empty;
    // Offsets expressed as [start, length] in the chunk text for the best match
    public int[] Offsets { get; set; } = Array.Empty<int>();
    public int ChunkIndex { get; set; }
    public double Score { get; set; }
}

// Request models
public class SearchResponse
{
    public List<SearchHit> Hits { get; set; } = new();
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

public class RagQueryRequest
{
    public List<(string role, string content)> Messages { get; set; } = new();
    public int TopK { get; set; } = 8;
    public double Alpha { get; set; } = 0.6;
    public Dictionary<string, string>? Filters { get; set; }
}

public class RagAnswer
{
    public string Answer { get; set; } = string.Empty;
    public List<RagCitation> Citations { get; set; } = new();
    public object Usage { get; set; } = new { prompt_tokens = 0, completion_tokens = 0 };
}

public class RagCitation
{
    public string NoteId { get; set; } = string.Empty;
    public string ChunkId { get; set; } = string.Empty;
    public int[] Offsets { get; set; } = Array.Empty<int>();
}

public class AgentActRequest
{
    public string Tool { get; set; } = string.Empty;
    public JsonElement Args { get; set; }
}

public class CardRequest
{
    public Dictionary<string, string>? Filter { get; set; }
}

// Stage1 new entities
public class Embedding
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ChunkId { get; set; } = string.Empty;
    public string Provider { get; set; } = "openai";
    public string Model { get; set; } = "text-embedding-3-small";
    public int Dim { get; set; } = 1536;
    public string VectorRef { get; set; } = string.Empty; // redis key or external reference
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public virtual NoteChunk Chunk { get; set; } = null!;
}

public class Tag
{
    [Key]
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    public virtual ICollection<NoteTag> NoteTags { get; set; } = new List<NoteTag>();
}

public class NoteTag
{
    public string NoteId { get; set; } = string.Empty;
    public int TagId { get; set; }

    public virtual Note Note { get; set; } = null!;
    public virtual Tag Tag { get; set; } = null!;
}

public class Classification
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string NoteId { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public double Score { get; set; }
    public string Model { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public virtual Note Note { get; set; } = null!;
}

public class ActionLog
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string AgentSessionId { get; set; } = string.Empty;
    public string Tool { get; set; } = string.Empty;
    public string InputJson { get; set; } = string.Empty;
    public string ResultJson { get; set; } = string.Empty;
    public string Status { get; set; } = "ok";
    public int Latency_ms { get; set; }
    public DateTime Ts { get; set; } = DateTime.UtcNow;
}

// Request model for folder ingestion
public record FolderIngestRequest(string Path);

// Stage 2 Models

/// <summary>
/// Entity detected in text (persons, organizations, locations, etc.)
/// </summary>
public class Entity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Type { get; set; } = string.Empty; // PERSON, ORG, LOCATION, etc.
    public string Value { get; set; } = string.Empty; // Actual entity text
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Text spans for PII, secrets, entities marking positions in notes
/// </summary>
public class TextSpan
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string NoteId { get; set; } = string.Empty;
    public int Start { get; set; } // Character start position
    public int End { get; set; }   // Character end position  
    public string Label { get; set; } = string.Empty; // PII, SECRET, ENTITY_PERSON, etc.
    public string EntityId { get; set; } = string.Empty; // Reference to Entity if applicable
    public double Confidence { get; set; } = 1.0; // Detection confidence 0-1
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public virtual Note Note { get; set; } = null!;
    public virtual Entity? Entity { get; set; }
}

// Stage 2 Request/Response Models

public class ClassificationResult
{
    public string NoteId { get; set; } = string.Empty;
    public List<TagPrediction> Tags { get; set; } = new();
    public int SensitivityLevel { get; set; }
    public List<PiiDetection> PiiFlags { get; set; } = new();
    public List<SecretDetection> SecretFlags { get; set; } = new();
    public string Summary { get; set; } = string.Empty;
}

public class TagPrediction
{
    public string Name { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public bool Suggested { get; set; } = true;
}

public class PiiDetection
{
    public string Type { get; set; } = string.Empty; // EMAIL, PHONE, TFN, etc.
    public string Value { get; set; } = string.Empty;
    public int Start { get; set; }
    public int End { get; set; }
    public double Confidence { get; set; }
}

public class SecretDetection
{
    public string Type { get; set; } = string.Empty; // API_KEY, PASSWORD, etc.
    public string Value { get; set; } = string.Empty; // Redacted value
    public int Start { get; set; }
    public int End { get; set; }
    public string Severity { get; set; } = "medium"; // low, medium, high, critical
}

public record BulkTagRequest(List<string> Ids, List<string> Add, List<string> Remove);

public record RedactionPreviewRequest(string NoteId, string Policy = "default");

public class RedactionPreviewResponse
{
    public string NoteId { get; set; } = string.Empty;
    public string MaskedText { get; set; } = string.Empty;
    public List<TextSpan> Spans { get; set; } = new();
    public int SensitivityLevel { get; set; }
}

// Classification feedback model
public class UserFeedback
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string NoteId { get; set; } = string.Empty;
    public string ActualTopic { get; set; } = string.Empty;
    public string ActualTags { get; set; } = string.Empty;
    public double ActualSensitivity { get; set; }
    public DateTime CreatedAt { get; set; }
}
