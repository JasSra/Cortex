using System.Collections.Generic;
using CortexApi.Models;

namespace CortexApi.Services;

// Job payload classes
public class EmbeddingJobPayload
{
    public string ChunkId { get; set; } = string.Empty;
}

public class ClassificationJobPayload
{
    public string NoteId { get; set; } = string.Empty;
}

public class PiiDetectionJobPayload
{
    public string NoteId { get; set; } = string.Empty;
}

public class WeeklyDigestJobPayload
{
    public string UserProfileId { get; set; } = string.Empty;
}

public class GraphEnrichJobPayload
{
    public string NoteId { get; set; } = string.Empty;
}

// Job statistics model
public class JobStats
{
    public int PendingJobs { get; set; }
    public int ProcessedJobs { get; set; }
    public int FailedJobs { get; set; }
    public TimeSpan AverageProcessingTime { get; set; }
    public int PendingStreams { get; set; }
    public int PendingBacklog { get; set; }
    public bool UsingStreams { get; set; }
    public bool RedisConnected { get; set; }
}

// Job details model
public class JobDetailsItem
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Stream { get; set; } = string.Empty;
    public DateTime? EnqueuedAt { get; set; }
    public Dictionary<string, object> Payload { get; set; } = new();
}

// Background job service interface
public interface IBackgroundJobService
{
    Task EnqueueJobAsync(string jobType, object payload, CancellationToken ct = default);
    Task<JobStats> GetStatsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<JobDetailsItem>> GetPendingJobsAsync(int maxItems = 100, CancellationToken ct = default);
    Task<int> RequeueEmbeddingBacklogAsync(int maxItems = 500, CancellationToken ct = default);
}

// Legacy stub implementation - DO NOT USE, for compatibility only
public class LegacyBackgroundJobService : IBackgroundJobService
{
    public Task EnqueueJobAsync(string jobType, object payload, CancellationToken ct = default)
    {
        throw new InvalidOperationException("Legacy BackgroundJobService is deprecated. Use HangfireBackgroundJobService instead.");
    }

    public Task<JobStats> GetStatsAsync(CancellationToken ct = default)
    {
        throw new InvalidOperationException("Legacy BackgroundJobService is deprecated. Use HangfireBackgroundJobService instead.");
    }

    public Task<IReadOnlyList<JobDetailsItem>> GetPendingJobsAsync(int maxItems = 100, CancellationToken ct = default)
    {
        throw new InvalidOperationException("Legacy BackgroundJobService is deprecated. Use HangfireBackgroundJobService instead.");
    }

    public Task<int> RequeueEmbeddingBacklogAsync(int maxItems = 500, CancellationToken ct = default)
    {
        throw new InvalidOperationException("Legacy BackgroundJobService is deprecated. Use HangfireBackgroundJobService instead.");
    }
}
