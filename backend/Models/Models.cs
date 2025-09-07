using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;

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
    public bool IsPinned { get; set; } = false;
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
    
    public int WordCount { get; set; }
    
    public string Tags { get; set; } = string.Empty; // JSON array
    
    // Link to stored file if available
    public string? StoredFileId { get; set; }
    
    public virtual ICollection<NoteChunk> Chunks { get; set; } = new List<NoteChunk>();
    public virtual ICollection<NoteTag> NoteTags { get; set; } = new List<NoteTag>();
    public virtual ICollection<Classification> Classifications { get; set; } = new List<Classification>();
    public virtual ICollection<TextSpan> Spans { get; set; } = new List<TextSpan>();
}

public class CreateNoteRequest
{
    public string? Title { get; set; }
    /// <summary>
    /// Note content. If empty, a default placeholder will be provided.
    /// </summary>
    public string Content { get; set; } = string.Empty;
}

public class UrlIngestResult
{
    public string? NoteId { get; set; }
    public string Title { get; set; } = string.Empty;
    public int CountChunks { get; set; }
    public string OriginalUrl { get; set; } = string.Empty;
    public string? FinalUrl { get; set; }
    public DateTime FetchedAt { get; set; } = DateTime.UtcNow;
    public string? Error { get; set; }
    public string Status { get; set; } = "success";
    public string? SiteName { get; set; }
    public string? Byline { get; set; }
    public string? PublishedTime { get; set; }
}

public class UserProfile
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    /// <summary>
    /// Subject ID from Azure AD B2C (unique identifier)
    /// </summary>
    public string SubjectId { get; set; } = string.Empty;
    
    /// <summary>
    /// User's email address
    /// </summary>
    public string Email { get; set; } = string.Empty;
    
    /// <summary>
    /// User's display name
    /// </summary>
    public string Name { get; set; } = string.Empty;
    
    /// <summary>
    /// User's bio/description
    /// </summary>
    public string Bio { get; set; } = string.Empty;
    
    /// <summary>
    /// Avatar image URL or base64 data
    /// </summary>
    public string Avatar { get; set; } = string.Empty;
    
    /// <summary>
    /// User preferences as JSON
    /// </summary>
    public string Preferences { get; set; } = "{}";
    
    /// <summary>
    /// Whether the user has completed onboarding
    /// </summary>
    public bool HasCompletedOnboarding { get; set; } = false;
    
    /// <summary>
    /// Last login timestamp
    /// </summary>
    public DateTime? LastLoginAt { get; set; }
    
    /// <summary>
    /// Profile creation timestamp
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Last profile update timestamp
    /// </summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Total number of notes created by user
    /// </summary>
    public int TotalNotes { get; set; } = 0;
    
    /// <summary>
    /// Total number of searches performed
    /// </summary>
    public int TotalSearches { get; set; } = 0;
    
    /// <summary>
    /// Total login count
    /// </summary>
    public int TotalLogins { get; set; } = 0;
    
    /// <summary>
    /// Current streak of consecutive daily logins
    /// </summary>
    public int LoginStreak { get; set; } = 0;
    
    /// <summary>
    /// Date of last login (for streak calculation)
    /// </summary>
    public DateTime? LastStreakDate { get; set; }
    
    /// <summary>
    /// Total time spent in app (in minutes)
    /// </summary>
    public int TotalTimeSpentMinutes { get; set; } = 0;
    
    /// <summary>
    /// Experience points
    /// </summary>
    public int ExperiencePoints { get; set; } = 0;
    
    /// <summary>
    /// Current level based on XP
    /// </summary>
    public int Level { get; set; } = 1;
    
    /// <summary>
    /// Navigation for user achievements
    /// </summary>
    public virtual ICollection<UserAchievement> UserAchievements { get; set; } = new List<UserAchievement>();

    // Security: hashed voice PIN for TTS/STT confirmation
    public string? VoicePinHash { get; set; }
}

// App-managed role assignment for users (merged with JWT roles)
public class UserRoleAssignment
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [Required]
    public string SubjectId { get; set; } = string.Empty;
    [Required]
    public string Role { get; set; } = string.Empty; // Admin|Editor|Reader
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Achievement
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    /// <summary>
    /// Achievement name/title
    /// </summary>
    public string Name { get; set; } = string.Empty;
    
    /// <summary>
    /// Achievement description
    /// </summary>
    public string Description { get; set; } = string.Empty;
    
    /// <summary>
    /// Achievement emoji/icon
    /// </summary>
    public string Icon { get; set; } = string.Empty;
    
    /// <summary>
    /// Achievement category (activity, milestone, streak, etc.)
    /// </summary>
    public string Category { get; set; } = string.Empty;
    
    /// <summary>
    /// Points awarded for this achievement
    /// </summary>
    public int Points { get; set; } = 0;
    
    /// <summary>
    /// Whether this achievement is hidden until unlocked
    /// </summary>
    public bool IsHidden { get; set; } = false;
    
    /// <summary>
    /// Sort order for display
    /// </summary>
    public int SortOrder { get; set; } = 0;
    
    /// <summary>
    /// Achievement criteria as JSON (flexible for different types)
    /// </summary>
    public string Criteria { get; set; } = "{}";
    
    /// <summary>
    /// When this achievement was created
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Navigation for users who earned this achievement
    /// </summary>
    public virtual ICollection<UserAchievement> UserAchievements { get; set; } = new List<UserAchievement>();
}

public class UserAchievement
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    /// <summary>
    /// User who earned the achievement
    /// </summary>
    public string UserProfileId { get; set; } = string.Empty;
    
    /// <summary>
    /// Achievement that was earned
    /// </summary>
    public string AchievementId { get; set; } = string.Empty;
    
    /// <summary>
    /// When the achievement was earned
    /// </summary>
    public DateTime EarnedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Progress towards achievement (for progressive achievements)
    /// </summary>
    public int Progress { get; set; } = 0;
    
    /// <summary>
    /// Whether user has seen this achievement notification
    /// </summary>
    public bool HasSeen { get; set; } = false;
    
    /// <summary>
    /// Navigation to user profile
    /// </summary>
    public virtual UserProfile UserProfile { get; set; } = null!;

    /// <summary>
    /// Navigation to achievement
    /// </summary>
    public virtual Achievement Achievement { get; set; } = null!;
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
    
    [JsonIgnore]
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
    // Pagination: zero-based offset. If provided, service will fetch (offset+K) candidates and then slice
    public int Offset { get; set; } = 0;
    public Dictionary<string, string>? Filters { get; set; }
    public string Mode { get; set; } = "hybrid"; // hybrid|semantic|bm25
    public double Alpha { get; set; } = 0.6; // weight for vector score
}

// Advanced search with Stage 2 filtering capabilities
public class AdvancedSearchRequest
{
    public string Q { get; set; } = string.Empty;
    public int K { get; set; } = 10;
    public int Offset { get; set; } = 0;
    public string Mode { get; set; } = "hybrid"; // hybrid|semantic|bm25
    public double Alpha { get; set; } = 0.6; // weight for vector score
    public bool UseReranking { get; set; } = true; // Enable cross-encoder reranking
    
    // Stage 2 Advanced Filters
    public int[]? SensitivityLevels { get; set; } // Filter by sensitivity (1=public, 2=low, 3=medium, 4=high)
    public string[]? Tags { get; set; } // Filter by specific tags
    public string[]? PiiTypes { get; set; } // Filter by PII types (EMAIL, PHONE, etc.)
    public string[]? SecretTypes { get; set; } // Filter by secret types (API_KEY, JWT_TOKEN, etc.)
    public bool ExcludePii { get; set; } = false; // Exclude documents with any PII
    public bool ExcludeSecrets { get; set; } = false; // Exclude documents with any secrets
    
    // Basic filters
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    public string[]? FileTypes { get; set; }
    public string? Source { get; set; }
}

public class SearchHit
{
    public string NoteId { get; set; } = string.Empty;
    public string ChunkId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Snippet { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string Highlight { get; set; } = string.Empty;
    // Offsets expressed as [start, length] in the chunk text for the best match
    public int[] Offsets { get; set; } = Array.Empty<int>();
    // Start position used to derive snippet window (for precise client highlighting)
    public int SnippetStart { get; set; }
    public int ChunkIndex { get; set; }
    public double Score { get; set; }
    
    // Stage 2 enhanced properties for auto-classification
    public DateTime CreatedAt { get; set; }
    public string Source { get; set; } = string.Empty;
    public string FileType { get; set; } = string.Empty;
    public int SensitivityLevel { get; set; }
    public List<string> Tags { get; set; } = new();
    public bool HasPii { get; set; }
    public bool HasSecrets { get; set; }
    public List<string> PiiTypes { get; set; } = new();
    public List<string> SecretTypes { get; set; } = new();
}

// Request models
public class SearchResponse
{
    public List<SearchHit> Hits { get; set; } = new();
    public int Total { get; set; }
    public int Offset { get; set; }
    public int K { get; set; }
}

public class ClassificationResponse
{
    public string NoteId { get; set; } = string.Empty;
    public List<string> Tags { get; set; } = new();
    public int Sensitivity { get; set; }
    public double SensitivityScore { get; set; }
    public List<string> Pii { get; set; } = new();
    public List<string> Secrets { get; set; } = new();
    public string Summary { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public DateTime ProcessedAt { get; set; }
    public string? Error { get; set; }
}

public class BulkClassificationRequest
{
    public List<string> NoteIds { get; set; } = new();
}

public class BulkClassificationResponse
{
    public List<ClassificationResponse> Results { get; set; } = new();
}

public class BulkTagRequest
{
    public List<string> NoteIds { get; set; } = new();
    public List<string>? Add { get; set; }
    public List<string>? Remove { get; set; }
}

public class BulkTagResponse
{
    public List<TagOperationResult> Results { get; set; } = new();
}

public class TagOperationResult
{
    public string NoteId { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int OriginalTagCount { get; set; }
    public int NewTagCount { get; set; }
    public List<string> Tags { get; set; } = new();
    public string? Error { get; set; }
}

public class TagsResponse
{
    public List<TagInfo> Tags { get; set; } = new();
}

public class TagInfo
{
    public string Name { get; set; } = string.Empty;
    public int Count { get; set; }
}

public class NoteTagsResponse
{
    public string NoteId { get; set; } = string.Empty;
    public List<string> Tags { get; set; } = new();
}

public class IngestResult
{
    public string NoteId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int CountChunks { get; set; }
    public string Status { get; set; } = "success"; // "success", "augmented", "duplicate", "error"
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
    public string Tool { get; set; } = string.Empty; // search_hybrid, tag_apply, etc.
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

    [JsonIgnore]
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

    [JsonIgnore]
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
///
/// </summary>
public class Entity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Type { get; set; } = string.Empty; // PERSON, ORG, LOCATION, etc.
    public string Value { get; set; } = string.Empty; // Actual entity text
    public string CanonicalValue { get; set; } = string.Empty; // Canonical form after deduplication
    public string? CanonicalEntityId { get; set; } // Reference to canonical entity if this is a duplicate
    public double ConfidenceScore { get; set; } = 1.0; // NER confidence
    public int MentionCount { get; set; } = 1; // How many times this entity appears
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public virtual Entity? CanonicalEntity { get; set; }
    public virtual ICollection<Edge> OutgoingEdges { get; set; } = new List<Edge>();
    public virtual ICollection<Edge> IncomingEdges { get; set; } = new List<Edge>();
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
    public string? EntityId { get; set; } // Reference to Entity if applicable
    public double Confidence { get; set; } = 1.0; // Detection confidence 0-1
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    [JsonIgnore]
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
    public double Confidence { get; set; } = 0.5; // Overall classification confidence
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

// Stage 2D Admin Embedding API Models

public class EmbedReindexRequest
{
    public string Scope { get; set; } = "all"; // all, note, since
    public string? NoteId { get; set; }
    public DateTime? Since { get; set; }
}

public class EmbedReindexResponse
{
    public bool Success { get; set; }
    public int ProcessedCount { get; set; }
    public int ErrorCount { get; set; }
    public List<string> Errors { get; set; } = new();
    public int DurationMs { get; set; }
    public DateTime CompletedAt { get; set; }
}

public class EmbedStatsResponse
{
    public int TotalNotes { get; set; }
    public int TotalChunks { get; set; }
    public int TotalEmbeddings { get; set; }
    public int ChunksWithoutEmbeddings { get; set; }
    public double CoveragePercentage { get; set; }
    public DateTime? NewestEmbeddingAt { get; set; }
    public DateTime? OldestEmbeddingAt { get; set; }
    public Dictionary<string, int> ProviderBreakdown { get; set; } = new();
    public Dictionary<string, int> ModelBreakdown { get; set; } = new();
}

// Stage 3 Models

/// <summary>
/// Graph edges representing relationships between entities
/// </summary>
public class Edge
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string FromEntityId { get; set; } = string.Empty;
    public string ToEntityId { get; set; } = string.Empty;
    public string RelationType { get; set; } = string.Empty; // same_topic, references, refines, contradicts
    public double Confidence { get; set; } = 0.0; // 0.0 to 1.0
    public string Source { get; set; } = string.Empty; // co-occurrence, llm, manual
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public virtual Entity FromEntity { get; set; } = null!;
    public virtual Entity ToEntity { get; set; } = null!;
}

/// <summary>
/// Tool execution requests for RAG assistant
/// </summary>
public class ToolRequest
{
    public string Tool { get; set; } = string.Empty; // search_hybrid, tag_apply, etc.
    public Dictionary<string, object> Parameters { get; set; } = new();
    public bool RequiresConfirmation { get; set; } = false;
}

/// <summary>
/// Tool execution results
/// </summary>
public class ToolResult
{
    public string Tool { get; set; } = string.Empty;
    public bool Success { get; set; }
    public object? Result { get; set; }
    public string? Error { get; set; }
    public DateTime ExecutedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Graph node for visualization
/// </summary>
public class GraphNode
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public int ConnectionCount { get; set; }
    public DateTime LastSeen { get; set; }
}

/// <summary>
/// Graph edge for visualization
/// </summary>
public class GraphEdge
{
    public string Id { get; set; } = string.Empty;
    public string FromId { get; set; } = string.Empty;
    public string ToId { get; set; } = string.Empty;
    public string RelationType { get; set; } = string.Empty;
    public double Confidence { get; set; }
}

/// <summary>
/// Daily digest entry
/// </summary>
public class DigestEntry
{
    public string Type { get; set; } = string.Empty; // new_notes, new_entities, duplicates, secrets
    public string Summary { get; set; } = string.Empty;
    public List<string> Items { get; set; } = new();
    public string Suggestion { get; set; } = string.Empty;
}

// Stage 3 Request/Response Models

public class GraphRequest
{
    public string? Focus { get; set; } // entity:ID format
    public int Depth { get; set; } = 2;
    public List<string> EntityTypes { get; set; } = new();
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
}

public class GraphResponse
{
    public List<GraphNode> Nodes { get; set; } = new();
    public List<GraphEdge> Edges { get; set; } = new();
    public int TotalNodes { get; set; }
    public int TotalEdges { get; set; }
}

public class ChatToolsRequest
{
    public string Query { get; set; } = string.Empty;
    public List<string> AvailableTools { get; set; } = new();
    public Dictionary<string, object> Context { get; set; } = new();
}

public class ChatToolsResponse
{
    public string Response { get; set; } = string.Empty;
    public List<ToolRequest> SuggestedTools { get; set; } = new();
    public bool RequiresConfirmation { get; set; }
}

public class DigestRequest
{
    public DateTime? Date { get; set; }
    public List<string> IncludeTypes { get; set; } = new();
}

public class DigestResponse
{
    public DateTime Date { get; set; }
    public List<DigestEntry> Entries { get; set; } = new();
    public string Summary { get; set; } = string.Empty;
}

public class ExportRequest
{
    public string Scope { get; set; } = "all"; // all, filtered, entity
    public string Format { get; set; } = "json"; // json, zip
    public bool IncludeSensitive { get; set; } = false;
    public List<string> EntityIds { get; set; } = new();
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
}

// Stage 3: Suggestions Engine Models
public class DailyDigest
{
    public DateTime Date { get; set; }
    public string Summary { get; set; } = string.Empty;
    public ActivitySummary RecentActivity { get; set; } = new();
    public List<string> KeyInsights { get; set; } = new();
    public List<ProactiveSuggestion> ProactiveSuggestions { get; set; } = new();
    public List<EntityCluster> EntityClusters { get; set; } = new();
    public DateTime GeneratedAt { get; set; }
}

public class ActivitySummary
{
    public int NotesCreated { get; set; }
    public List<CategoryCount> TopCategories { get; set; } = new();
    public List<EntityTrend> TrendingEntities { get; set; } = new();
}

public class CategoryCount
{
    public string Category { get; set; } = string.Empty;
    public int Count { get; set; }
}

public class EntityTrend
{
    public string EntityType { get; set; } = string.Empty;
    public int Count { get; set; }
    public string TrendDirection { get; set; } = "stable"; // up, down, stable
}

public class ProactiveSuggestion
{
    public string Type { get; set; } = string.Empty; // tagging, review, connection, content_gap
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ActionUrl { get; set; } = string.Empty;
    public string Priority { get; set; } = "medium"; // high, medium, low
    public int EstimatedTimeMinutes { get; set; }
}

public class EntityCluster
{
    public string Name { get; set; } = string.Empty;
    public List<string> EntityTypes { get; set; } = new();
    public int Strength { get; set; }
    public string Description { get; set; } = string.Empty;
}

public class EntityInsight
{
    public string EntityType { get; set; } = string.Empty;
    public string EntityValue { get; set; } = string.Empty;
    public int Frequency { get; set; }
    public DateTime LastSeen { get; set; }
    public double Confidence { get; set; }
}

// Enhanced Graph Analysis Models
public class GraphInsights
{
    public int TotalEntities { get; set; }
    public int TotalRelationships { get; set; }
    public int ConnectedEntities { get; set; }
    public int IsolatedEntities { get; set; }
    public List<GraphHub> TopHubs { get; set; } = new();
    public Dictionary<string, int> RelationshipTypeDistribution { get; set; } = new();
    public double GraphDensity { get; set; }
    public DateTime GeneratedAt { get; set; }
}

public class GraphHub
{
    public string EntityId { get; set; } = string.Empty;
    public string EntityLabel { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public int ConnectionCount { get; set; }
}

public class GraphRebuildResult
{
    public bool Success { get; set; }
    public bool ClearedEntities { get; set; }
    public int ProcessedNotes { get; set; }
    public int FailedNotes { get; set; }
    public int TotalEntities { get; set; }
    public int TotalRelations { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime CompletedAt { get; set; }
    public TimeSpan Duration => CompletedAt - DateTime.UtcNow.AddSeconds(-30); // Rough estimate
}

public class GraphSuggestion
{
    public string FromEntityId { get; set; } = string.Empty;
    public string FromEntityName { get; set; } = string.Empty;
    public string FromEntityType { get; set; } = string.Empty;
    public string ToEntityId { get; set; } = string.Empty;
    public string ToEntityName { get; set; } = string.Empty;
    public string ToEntityType { get; set; } = string.Empty;
    public string SuggestedRelationType { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public string Reason { get; set; } = string.Empty;
    public List<string> SupportingNotes { get; set; } = new();
}

// Security & Audit Models
public class AuditEntry
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string ResourceType { get; set; } = string.Empty;
    public string ResourceId { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string IpAddress { get; set; } = string.Empty;
    public string UserAgent { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class AuditSummary
{
    public DateTime FromDate { get; set; }
    public DateTime ToDate { get; set; }
    public int TotalActions { get; set; }
    public int UniqueUsers { get; set; }
    public Dictionary<string, int> ActionBreakdown { get; set; } = new();
    public Dictionary<string, int> ResourceTypeBreakdown { get; set; } = new();
    public int SensitiveOperations { get; set; }
    public List<UserActivity> TopUsers { get; set; } = new();
    public DateTime GeneratedAt { get; set; }
}

public class UserActivity
{
    public string UserId { get; set; } = string.Empty;
    public int ActionCount { get; set; }
}

// Add these models to the existing Models.cs file before the final closing brace

// Notification Models
/// <summary>
/// Registered devices for push notifications
/// </summary>
public class NotificationDevice
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserProfileId { get; set; } = string.Empty;
    public string Endpoint { get; set; } = string.Empty;
    public string P256dh { get; set; } = string.Empty;
    public string Auth { get; set; } = string.Empty;
    public string DeviceType { get; set; } = string.Empty; // web, mobile, desktop
    public string? DeviceName { get; set; }
    public string? UserAgent { get; set; }
    public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastUsed { get; set; }
    public bool IsActive { get; set; } = true;
    
    public virtual UserProfile UserProfile { get; set; } = null!;
}

/// <summary>
/// Notification history log
/// </summary>
public class NotificationHistory
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserProfileId { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // achievement, weekly_digest, maintenance, test, etc.
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty; // sent, delivered, failed, read
    public string DeliveryMethods { get; set; } = "[]"; // JSON array of delivery methods used
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }
    
    public virtual UserProfile UserProfile { get; set; } = null!;
}

// Stored files (user uploads that are not ingested/searchable)
public class StoredFile
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public string StoredPath { get; set; } = string.Empty; // absolute path on disk
    public string RelativePath { get; set; } = string.Empty; // path under storage root for URL construction
    public string ContentType { get; set; } = "application/octet-stream";
    public long SizeBytes { get; set; }
    public string Extension { get; set; } = string.Empty;
    public string Tags { get; set; } = string.Empty; // comma-separated tags
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class TagSearchResponse
{
    public int Total { get; set; }
    public int Offset { get; set; }
    public int Limit { get; set; }
    public List<NoteMeta> Items { get; set; } = new();
}

public class NoteMeta
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string FileType { get; set; } = string.Empty;
    public int SensitivityLevel { get; set; }
    public int ChunkCount { get; set; }
    public List<string> Tags { get; set; } = new();
}

public class EmbeddingCache
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TextHash { get; set; } = string.Empty; // SHA256 of normalized text
    public string Provider { get; set; } = "openai";
    public string Model { get; set; } = "text-embedding-3-small";
    public int Dim { get; set; } = 1536;
    public string VectorJson { get; set; } = "[]"; // serialized float[]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// User workspace state for working area
public class UserWorkspace
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    public string UserId { get; set; } = string.Empty;
    
    /// <summary>
    /// ID of the currently active/open note
    /// </summary>
    public string? ActiveNoteId { get; set; }
    
    /// <summary>
    /// JSON array of recently accessed note IDs (max 20)
    /// </summary>
    public string RecentNoteIds { get; set; } = "[]";
    
    /// <summary>
    /// JSON object with editor state (cursor position, scroll, etc.)
    /// </summary>
    public string EditorState { get; set; } = "{}";
    
    /// <summary>
    /// JSON array of pinned tag IDs for quick access
    /// </summary>
    public string PinnedTags { get; set; } = "[]";
    
    /// <summary>
    /// JSON object with workspace layout preferences
    /// </summary>
    public string LayoutPreferences { get; set; } = "{}";
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public virtual Note? ActiveNote { get; set; }
}

// Track user note access for recent notes functionality  
public class UserNoteAccess
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    public string UserId { get; set; } = string.Empty;
    public string NoteId { get; set; } = string.Empty;
    
    /// <summary>
    /// Type of access: view, edit, create
    /// </summary>
    public string AccessType { get; set; } = "view";
    
    /// <summary>
    /// Duration of access in seconds
    /// </summary>
    public int DurationSeconds { get; set; }
    
    /// <summary>
    /// Editor state when note was closed (for restoration)
    /// </summary>
    public string? EditorStateSnapshot { get; set; }
    
    public DateTime AccessedAt { get; set; } = DateTime.UtcNow;
    
    public virtual Note Note { get; set; } = null!;
}

// Configuration setting entity - stores all app configuration in database
public class ConfigurationSetting
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    /// <summary>
    /// Configuration key (e.g., "OpenAI:ApiKey", "Embedding:Provider")
    /// </summary>
    public string Key { get; set; } = string.Empty;
    
    /// <summary>
    /// Configuration value (stored as string, parsed as needed)
    /// </summary>
    public string Value { get; set; } = string.Empty;
    
    /// <summary>
    /// Data type of the value (string, number, boolean, json)
    /// </summary>
    public string ValueType { get; set; } = "string";
    
    /// <summary>
    /// Configuration category/section (e.g., "OpenAI", "Embedding", "Redis")
    /// </summary>
    public string Section { get; set; } = string.Empty;
    
    /// <summary>
    /// Human-readable description of this setting
    /// </summary>
    public string Description { get; set; } = string.Empty;
    
    /// <summary>
    /// Whether this setting is sensitive (password, API key, etc.)
    /// </summary>
    public bool IsSensitive { get; set; }
    
    /// <summary>
    /// Whether this setting requires app restart to take effect
    /// </summary>
    public bool RequiresRestart { get; set; }
    
    /// <summary>
    /// Default value for this setting
    /// </summary>
    public string DefaultValue { get; set; } = string.Empty;
    
    /// <summary>
    /// Validation rules for this setting (JSON)
    /// </summary>
    public string ValidationRules { get; set; } = "{}";
    
    /// <summary>
    /// Sort order for display in UI
    /// </summary>
    public int SortOrder { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// DTOs for configuration API
public class ConfigurationSectionDto
{
    public string Name { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public List<ConfigurationSettingDto> Settings { get; set; } = new();
}

public class ConfigurationSettingDto
{
    public string Id { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string ValueType { get; set; } = string.Empty;
    public string Section { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool IsSensitive { get; set; }
    public bool RequiresRestart { get; set; }
    public string DefaultValue { get; set; } = string.Empty;
    public string ValidationRules { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class UpdateConfigurationRequest
{
    public List<ConfigurationUpdateItem> Settings { get; set; } = new();
}

public class ConfigurationUpdateItem
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}

public class ValidateConfigurationRequest
{
    public List<ConfigurationUpdateItem> Settings { get; set; } = new();
}

public class ConfigurationValidationResult
{
    public bool IsValid { get; set; }
    public List<ValidationError> Errors { get; set; } = new();
    public List<ValidationWarning> Warnings { get; set; } = new();
    public string Message { get; set; } = string.Empty;
}

public class ValidationError
{
    public string Key { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
}

public class ValidationWarning
{
    public string Key { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
}

// AI Suggestions and Processing Models
public class AssistRequest
{
    public string? Prompt { get; set; }
    public string? Context { get; set; }
    public string? Mode { get; set; } // suggest, summarize, rewrite
    public string? Provider { get; set; } // openai, ollama
    public int? MaxTokens { get; set; }
    public double? Temperature { get; set; }
}

public class AssistResponse
{
    public string Text { get; set; } = string.Empty;
}

public class SummaryRequest
{
    public string Content { get; set; } = string.Empty;
    public int? MaxLength { get; set; }
}

public class SummaryResponse
{
    public string Summary { get; set; } = string.Empty;
    public int WordCount { get; set; }
}

public class ClassificationRequest
{
    public string Content { get; set; } = string.Empty;
    public string? NoteId { get; set; }
}

public class EntityInsights
{
    public List<string> TopEntities { get; set; } = new();
    public List<string> RecentConnections { get; set; } = new();
    public List<string> SuggestedExplorations { get; set; } = new();
}
