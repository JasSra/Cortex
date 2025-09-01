using CortexApi.Models;

namespace CortexApi.Services;

/// <summary>
/// Interface for background job processors used with Hangfire
/// </summary>
public interface IBackgroundJobProcessor
{
    /// <summary>
    /// Process an embedding job for a specific chunk
    /// </summary>
    Task ProcessEmbeddingJobAsync(string chunkId, CancellationToken ct = default);
    
    /// <summary>
    /// Process a classification job for a specific note
    /// </summary>
    Task ProcessClassificationJobAsync(string noteId, CancellationToken ct = default);
    
    /// <summary>
    /// Process a PII detection job for a specific note
    /// </summary>
    Task ProcessPiiDetectionJobAsync(string noteId, CancellationToken ct = default);
    
    /// <summary>
    /// Process a weekly digest job for a specific user
    /// </summary>
    Task ProcessWeeklyDigestJobAsync(string userProfileId, CancellationToken ct = default);
    
    /// <summary>
    /// Process a graph enrichment job
    /// </summary>
    Task ProcessGraphEnrichJobAsync(string? noteId = null, CancellationToken ct = default);
}
