using System.Text.Json;
using CortexApi.Data;
using CortexApi.Models;
using Microsoft.EntityFrameworkCore;
using Hangfire;

namespace CortexApi.Services;

public class HangfireBackgroundJobService : IBackgroundJobService
{
	private readonly IServiceScopeFactory _scopeFactory;
	private readonly ILogger<HangfireBackgroundJobService> _logger;
	private readonly IConfiguration _configuration;
	private readonly IBackgroundJobProcessor _processor;

	public HangfireBackgroundJobService(
		IServiceScopeFactory scopeFactory, 
		ILogger<HangfireBackgroundJobService> logger, 
		IConfiguration configuration,
		IBackgroundJobProcessor processor)
	{
		_scopeFactory = scopeFactory;
		_logger = logger;
		_configuration = configuration;
		_processor = processor;
	}

	public Task EnqueueJobAsync(string jobType, object payload, CancellationToken ct = default)
	{
		try
		{
			switch (jobType)
			{
				case "embedding":
					var embeddingPayload = payload as EmbeddingJobPayload ?? 
						JsonSerializer.Deserialize<EmbeddingJobPayload>(JsonSerializer.Serialize(payload)) ?? 
						new EmbeddingJobPayload();
					BackgroundJob.Enqueue<IBackgroundJobProcessor>(x => x.ProcessEmbeddingJobAsync(embeddingPayload.ChunkId, CancellationToken.None));
					break;
					
				case "classification":
					var classificationPayload = payload as ClassificationJobPayload ?? 
						JsonSerializer.Deserialize<ClassificationJobPayload>(JsonSerializer.Serialize(payload)) ?? 
						new ClassificationJobPayload();
					BackgroundJob.Enqueue<IBackgroundJobProcessor>(x => x.ProcessClassificationJobAsync(classificationPayload.NoteId, CancellationToken.None));
					break;
					
				case "pii_detection":
					var piiPayload = payload as PiiDetectionJobPayload ?? 
						JsonSerializer.Deserialize<PiiDetectionJobPayload>(JsonSerializer.Serialize(payload)) ?? 
						new PiiDetectionJobPayload();
					BackgroundJob.Enqueue<IBackgroundJobProcessor>(x => x.ProcessPiiDetectionJobAsync(piiPayload.NoteId, CancellationToken.None));
					break;
					
				case "weekly_digest":
					var digestPayload = payload as WeeklyDigestJobPayload ?? 
						JsonSerializer.Deserialize<WeeklyDigestJobPayload>(JsonSerializer.Serialize(payload)) ?? 
						new WeeklyDigestJobPayload();
					BackgroundJob.Enqueue<IBackgroundJobProcessor>(x => x.ProcessWeeklyDigestJobAsync(digestPayload.UserProfileId, CancellationToken.None));
					break;
					
				case "graph_enrich":
					var graphPayload = payload as GraphEnrichJobPayload ?? 
						JsonSerializer.Deserialize<GraphEnrichJobPayload>(JsonSerializer.Serialize(payload)) ?? 
						new GraphEnrichJobPayload();
					BackgroundJob.Enqueue<IBackgroundJobProcessor>(x => x.ProcessGraphEnrichJobAsync(graphPayload.NoteId, CancellationToken.None));
					break;
					
				default:
					throw new ArgumentException($"Unknown job type: {jobType}");
			}

			_logger.LogDebug("Enqueued {JobType} job with Hangfire", jobType);
		}
		catch (Exception ex)
		{
			_logger.LogError(ex, "Failed to enqueue {JobType} job", jobType);
			throw;
		}
		
		return Task.CompletedTask;
	}

	public async Task<JobStats> GetStatsAsync(CancellationToken ct = default)
	{
		var api = JobStorage.Current.GetMonitoringApi();
		
		// Get Hangfire statistics  
		var statistics = api.GetStatistics();
		var pendingJobs = (int)statistics.Enqueued;
		var processedJobs = (int)statistics.Succeeded;
		var failedJobs = (int)statistics.Failed;

		// Count EF backlog (chunks without embeddings)
		int pendingBacklog = 0;
		try
		{
			using var scope = _scopeFactory.CreateScope();
			var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();

			pendingBacklog = await (
				from ch in db.NoteChunks.AsNoTracking()
				join em in db.Embeddings.AsNoTracking() on ch.Id equals em.ChunkId into gj
				from em in gj.DefaultIfEmpty()
				where em == null
				select ch.Id
			).CountAsync(ct);
		}
		catch (Exception ex)
		{
			_logger.LogDebug(ex, "Failed to compute EF backlog stats");
		}

		return new JobStats
		{
			PendingJobs = pendingJobs + pendingBacklog,
			ProcessedJobs = processedJobs,
			FailedJobs = failedJobs,
			AverageProcessingTime = TimeSpan.Zero,
			PendingStreams = 0, // No Redis streams in use
			PendingBacklog = pendingBacklog,
			UsingStreams = false, // Hangfire-only
			RedisConnected = false, // Job system uses SQLite storage
		};
	}

	public async Task<IReadOnlyList<JobDetailsItem>> GetPendingJobsAsync(int maxItems = 100, CancellationToken ct = default)
	{
		var results = new List<JobDetailsItem>();
		var api = JobStorage.Current.GetMonitoringApi();

		// Get pending jobs from Hangfire
		var enqueuedJobs = api.EnqueuedJobs("default", 0, Math.Min(maxItems, 50));
		foreach (var job in enqueuedJobs)
		{
			var payload = new Dictionary<string, object>
			{
				{ "PendingReason", "Queued in Hangfire; awaiting worker" },
				{ "JobId", job.Key },
				{ "Method", job.Value?.Job?.Method?.Name ?? "Unknown" }
			};

			// Extract arguments if available
			if (job.Value?.Job?.Args != null)
			{
				for (int i = 0; i < job.Value.Job.Args.Count; i++)
				{
					payload[$"Arg{i}"] = job.Value.Job.Args[i]?.ToString() ?? "null";
				}
			}

			results.Add(new JobDetailsItem
			{
				Id = job.Key,
				Type = ExtractJobTypeFromMethod(job.Value?.Job?.Method?.Name),
				Stream = "hangfire",
				EnqueuedAt = job.Value?.EnqueuedAt,
				Payload = payload
			});

			if (results.Count >= maxItems) break;
		}

		// Add EF backlog items if there's remaining capacity
		int remaining = Math.Max(0, maxItems - results.Count);
		if (remaining > 0)
		{
			try
			{
				using var scope = _scopeFactory.CreateScope();
				var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();

				var backlog = await (
					from ch in db.NoteChunks.AsNoTracking()
					join em in db.Embeddings.AsNoTracking() on ch.Id equals em.ChunkId into gj
					from em in gj.DefaultIfEmpty()
					where em == null
					orderby ch.CreatedAt
					select new { ch.Id, ch.NoteId, ch.CreatedAt }
				)
				.Take(Math.Min(remaining, 200))
				.ToListAsync(ct);

				foreach (var item in backlog)
				{
					var payload = new Dictionary<string, object>
					{
						{ "ChunkId", item.Id },
						{ "NoteId", item.NoteId },
						{ "PendingReason", "Embedding missing; waiting for processing" }
					};

					results.Add(new JobDetailsItem
					{
						Id = $"backlog:{item.Id}",
						Type = "embedding",
						Stream = "backlog",
						EnqueuedAt = item.CreatedAt,
						Payload = payload
					});
				}
			}
			catch (Exception ex)
			{
				_logger.LogDebug(ex, "Failed to enumerate EF backlog items");
			}
		}

		return results;
	}

	public async Task<int> RequeueEmbeddingBacklogAsync(int maxItems = 500, CancellationToken ct = default)
	{
		int enqueued = 0;
		try
		{
			using var scope = _scopeFactory.CreateScope();
			var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();

			var backlog = await (
				from ch in db.NoteChunks.AsNoTracking()
				join em in db.Embeddings.AsNoTracking() on ch.Id equals em.ChunkId into gj
				from em in gj.DefaultIfEmpty()
				where em == null
				orderby ch.CreatedAt
				select ch.Id
			).Take(Math.Max(1, maxItems)).ToListAsync(ct);

			foreach (var chunkId in backlog)
			{
				await EnqueueJobAsync("embedding", new EmbeddingJobPayload { ChunkId = chunkId }, ct);
				enqueued++;
			}
		}
		catch (Exception ex)
		{
			_logger.LogWarning(ex, "Failed to requeue embedding backlog");
		}
		return enqueued;
	}

	private static string ExtractJobTypeFromMethod(string? methodName)
	{
		return methodName switch
		{
			"ProcessEmbeddingJobAsync" => "embedding",
			"ProcessClassificationJobAsync" => "classification",
			"ProcessPiiDetectionJobAsync" => "pii_detection",
			"ProcessWeeklyDigestJobAsync" => "weekly_digest",
			"ProcessGraphEnrichJobAsync" => "graph_enrich",
			_ => "unknown"
		};
	}
}
