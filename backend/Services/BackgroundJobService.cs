using System.Text.Json;
using CortexApi.Data;
using CortexApi.Models;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

namespace CortexApi.Services;

public interface IBackgroundJobService
{
    Task EnqueueJobAsync(string jobType, object payload, CancellationToken ct = default);
    Task<JobStats> GetStatsAsync(CancellationToken ct = default);
}

public class JobStats
{
    public int PendingJobs { get; set; }
    public int ProcessedJobs { get; set; }
    public int FailedJobs { get; set; }
    public TimeSpan AverageProcessingTime { get; set; }
}

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
    public string? NoteId { get; set; } // if null, process batch of notes
}

public class BackgroundJobService : BackgroundService, IBackgroundJobService
{
	private readonly IServiceScopeFactory _scopeFactory;
	private readonly ILogger<BackgroundJobService> _logger;
	private readonly IConfiguration _configuration;
	private bool _indexEnsured = false;
	private readonly HashSet<string> _inProgress = new();
	private readonly object _lock = new();
	private int _idleStreak = 0;
	private ConnectionMultiplexer? _redis;
	private IDatabase? _db;
	
	// Redis Stream names for different job types
	private const string EMBEDDING_STREAM = "jobs:embedding";
	private const string CLASSIFICATION_STREAM = "jobs:classification";
	private const string PII_DETECTION_STREAM = "jobs:pii_detection";
	private const string WEEKLY_DIGEST_STREAM = "jobs:weekly_digest";
    private const string GRAPH_ENRICH_STREAM = "jobs:graph_enrich";
	private const string CONSUMER_GROUP = "cortex-workers";
	private const string CONSUMER_NAME = "worker-1";

	public BackgroundJobService(IServiceScopeFactory scopeFactory, ILogger<BackgroundJobService> logger, IConfiguration configuration)
	{
		_scopeFactory = scopeFactory;
		_logger = logger;
		_configuration = configuration;
	}
	
	private async Task<bool> InitializeRedisAsync()
	{
		try
		{
			var redisConfig = _configuration.GetConnectionString("Redis");
			if (string.IsNullOrEmpty(redisConfig))
			{
				_logger.LogWarning("Redis connection string not configured, falling back to polling mode");
				return false;
			}
			
			_redis = await ConnectionMultiplexer.ConnectAsync(redisConfig);
			_db = _redis.GetDatabase();
			
			// Create consumer groups for each stream
			await CreateConsumerGroupAsync(EMBEDDING_STREAM);
			await CreateConsumerGroupAsync(CLASSIFICATION_STREAM);
			await CreateConsumerGroupAsync(PII_DETECTION_STREAM);
			await CreateConsumerGroupAsync(WEEKLY_DIGEST_STREAM);
            await CreateConsumerGroupAsync(GRAPH_ENRICH_STREAM);
			
			_logger.LogInformation("Redis Streams initialized successfully");
			return true;
		}
		catch (Exception ex)
		{
			_logger.LogWarning(ex, "Failed to initialize Redis Streams, falling back to polling mode");
			return false;
		}
	}
	
	private async Task CreateConsumerGroupAsync(string streamName)
	{
		try
		{
			await _db!.StreamCreateConsumerGroupAsync(streamName, CONSUMER_GROUP, "0", createStream: true);
		}
		catch (RedisServerException ex) when (ex.Message.Contains("BUSYGROUP"))
		{
			// Consumer group already exists, which is fine
		}
	}

	public async Task EnqueueJobAsync(string jobType, object payload, CancellationToken ct = default)
	{
		if (_db == null)
		{
			_logger.LogWarning("Redis not available, cannot enqueue job of type {JobType}", jobType);
			return;
		}

		var streamName = jobType switch
		{
			"embedding" => EMBEDDING_STREAM,
			"classification" => CLASSIFICATION_STREAM,
			"pii_detection" => PII_DETECTION_STREAM,
			"weekly_digest" => WEEKLY_DIGEST_STREAM,
            "graph_enrich" => GRAPH_ENRICH_STREAM,
			_ => throw new ArgumentException($"Unknown job type: {jobType}")
		};

		var fields = new NameValueEntry[]
		{
			new("type", jobType),
			new("payload", JsonSerializer.Serialize(payload)),
			new("enqueued_at", DateTimeOffset.UtcNow.ToUnixTimeSeconds())
		};

		await _db.StreamAddAsync(streamName, fields);
		_logger.LogDebug("Enqueued {JobType} job to stream {StreamName}", jobType, streamName);
	}

	public async Task<JobStats> GetStatsAsync(CancellationToken ct = default)
	{
		if (_db == null)
		{
			return new JobStats();
		}

		try
		{
			var embeddingInfo = await _db.StreamInfoAsync(EMBEDDING_STREAM);
			var classificationInfo = await _db.StreamInfoAsync(CLASSIFICATION_STREAM);
			var piiInfo = await _db.StreamInfoAsync(PII_DETECTION_STREAM);
			var weeklyDigestInfo = await _db.StreamInfoAsync(WEEKLY_DIGEST_STREAM);
            var graphInfo = await _db.StreamInfoAsync(GRAPH_ENRICH_STREAM);

			return new JobStats
			{
				PendingJobs = (int)(embeddingInfo.Length + classificationInfo.Length + piiInfo.Length + weeklyDigestInfo.Length + graphInfo.Length),
				ProcessedJobs = 0,
				FailedJobs = 0,
				AverageProcessingTime = TimeSpan.Zero
			};
		}
		catch (Exception ex)
		{
			_logger.LogWarning(ex, "Failed to get job stats");
			return new JobStats();
		}
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken)
	{
		// Delay a moment for app startup
		await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
		
		// Try to initialize Redis Streams
		bool useStreams = await InitializeRedisAsync();

        // periodic graph enrichment ticker
        var lastGraphSweep = DateTime.UtcNow;

		while (!stoppingToken.IsCancellationRequested)
		{
			try
			{
				using var scope = _scopeFactory.CreateScope();
				var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
				var vector = scope.ServiceProvider.GetRequiredService<IVectorService>();
				var embed = scope.ServiceProvider.GetRequiredService<IEmbeddingService>();
                var ner = scope.ServiceProvider.GetRequiredService<INerService>();
                var graph = scope.ServiceProvider.GetRequiredService<IGraphService>();
				var classification = scope.ServiceProvider.GetRequiredService<IClassificationService>();
				var piiDetection = scope.ServiceProvider.GetRequiredService<IPiiDetectionService>();

				// Ensure vector index once
				if (!_indexEnsured)
				{
					try
					{
						await vector.EnsureIndexAsync(embed.GetEmbeddingDim(), stoppingToken);
						_indexEnsured = true;
					}
					catch (Exception ex)
					{
						// Optional backend; try again later
						_logger.LogDebug(ex, "Vector index ensure deferred");
					}
				}

				if (useStreams && _db != null)
				{
					// Process jobs from Redis Streams
					await ProcessStreamsAsync(scope, stoppingToken);
				}
				else
				{
					// Fallback to polling mode
					await ProcessPollingAsync(scope, stoppingToken);
				}

                // Periodically sweep notes to extract entities/edges
                if ((DateTime.UtcNow - lastGraphSweep) > TimeSpan.FromMinutes(5))
                {
                    await SweepGraphAsync(scope, stoppingToken);
                    lastGraphSweep = DateTime.UtcNow;
                }

				// Backoff logic
				_idleStreak = _idleStreak > 0 ? Math.Min(_idleStreak + 1, 6) : 0;
				var idleSeconds = _idleStreak > 0 ? Math.Min(30, Math.Pow(2, _idleStreak)) : 1;
				var delay = TimeSpan.FromSeconds(idleSeconds);
				await Task.Delay(delay, stoppingToken);
			}
			catch (TaskCanceledException)
			{
				// shutdown
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "BackgroundJobService loop error");
				await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
			}
		}
	}
	
	private async Task ProcessStreamsAsync(IServiceScope scope, CancellationToken stoppingToken)
	{
		// Read from multiple streams with timeout
		var streamResults = new List<StreamEntry>();
		
		try
		{
			// Read from each stream individually
			var embeddingResults = await _db!.StreamReadGroupAsync(EMBEDDING_STREAM, CONSUMER_GROUP, CONSUMER_NAME, ">", 5);
			var classificationResults = await _db!.StreamReadGroupAsync(CLASSIFICATION_STREAM, CONSUMER_GROUP, CONSUMER_NAME, ">", 5);
			var piiResults = await _db!.StreamReadGroupAsync(PII_DETECTION_STREAM, CONSUMER_GROUP, CONSUMER_NAME, ">", 5);
			var weeklyDigestResults = await _db!.StreamReadGroupAsync(WEEKLY_DIGEST_STREAM, CONSUMER_GROUP, CONSUMER_NAME, ">", 5);
            var graphResults = await _db!.StreamReadGroupAsync(GRAPH_ENRICH_STREAM, CONSUMER_GROUP, CONSUMER_NAME, ">", 5);
			
			streamResults.AddRange(embeddingResults.Select(r => r));
			streamResults.AddRange(classificationResults.Select(r => r));
			streamResults.AddRange(piiResults.Select(r => r));
			streamResults.AddRange(weeklyDigestResults.Select(r => r));
            streamResults.AddRange(graphResults.Select(r => r));
		}
		catch (Exception ex)
		{
			_logger.LogDebug(ex, "No messages available from streams");
			return;
		}
		
		bool processedAny = false;
		foreach (var message in streamResults.Take(10)) // Process up to 10 messages per cycle
		{
			processedAny = true;
			
			// Determine which stream this message came from based on job type
			var typeField = message.Values.FirstOrDefault(v => v.Name == "type");
			if (!typeField.Value.IsNull)
			{
				var jobType = typeField.Value.ToString();
				var streamName = jobType switch
				{
					"embedding" => EMBEDDING_STREAM,
					"classification" => CLASSIFICATION_STREAM,
					"pii_detection" => PII_DETECTION_STREAM,
					"weekly_digest" => WEEKLY_DIGEST_STREAM,
                    "graph_enrich" => GRAPH_ENRICH_STREAM,
					_ => EMBEDDING_STREAM // default
				};
				
				await ProcessStreamMessage(scope, streamName, message, stoppingToken);
				
				// Acknowledge the message
				await _db.StreamAcknowledgeAsync(streamName, CONSUMER_GROUP, message.Id);
			}
		}
		
		if (processedAny)
		{
			_idleStreak = 0;
		}
	}
	
	private async Task ProcessPollingAsync(IServiceScope scope, CancellationToken stoppingToken)
	{
		var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
		var vector = scope.ServiceProvider.GetRequiredService<IVectorService>();
		var embed = scope.ServiceProvider.GetRequiredService<IEmbeddingService>();

		// Fetch a small batch of chunks that do not have embeddings yet
		var pending = await db.NoteChunks
			.AsNoTracking()
			.Where(c => !db.Embeddings.Any(e => e.ChunkId == c.Id))
			.OrderBy(c => c.CreatedAt)
			.Take(16)
			.ToListAsync(stoppingToken);

		// In-process dedupe to avoid reprocessing the same ids within a cycle
		var work = new List<NoteChunk>();
		lock (_lock)
		{
			foreach (var c in pending)
			{
				if (_inProgress.Add(c.Id)) work.Add(c);
			}
		}

		foreach (var chunk in work)
		{
			var note = await db.Notes.FirstAsync(n => n.Id == chunk.NoteId, stoppingToken);
			var vec = await embed.EmbedAsync(chunk.Content, stoppingToken);
			if (vec is null) continue;

			await vector.UpsertChunkAsync(note, chunk, vec, stoppingToken);

			// Create or update embedding record
			var existingEmbedding = await db.Embeddings.FirstOrDefaultAsync(e => e.ChunkId == chunk.Id, stoppingToken);
			if (existingEmbedding == null)
			{
				// Create new embedding record
				var embeddingRecord = new Models.Embedding
				{
					ChunkId = chunk.Id,
					Provider = _configuration["Embedding:Provider"] ?? "openai",
					Model = _configuration["Embedding:Model"] ?? "text-embedding-3-small",
					Dim = vec.Length,
					VectorRef = $"chunk:{chunk.Id}",
					CreatedAt = DateTime.UtcNow
				};

				db.Embeddings.Add(embeddingRecord);
			}
			
			// Mark as done in local set once tracked in DbContext
			lock (_lock) { _inProgress.Remove(chunk.Id); }
		}

		if (work.Count > 0)
		{
			await db.SaveChangesAsync(stoppingToken);
			_idleStreak = 0;
		}
	}
	
	private async Task ProcessStreamMessage(IServiceScope scope, string streamName, StreamEntry message, CancellationToken stoppingToken)
	{
		try
		{
			var typeField = message.Values.FirstOrDefault(v => v.Name == "type");
			var payloadField = message.Values.FirstOrDefault(v => v.Name == "payload");
			
			if (typeField.Value.IsNull || payloadField.Value.IsNull)
			{
				_logger.LogWarning("Malformed stream message in {StreamName}: {MessageId}", streamName, message.Id);
				return;
			}

			var jobType = typeField.Value.ToString();
			var payloadJson = payloadField.Value.ToString();

			switch (jobType)
			{
				case "embedding":
					await ProcessEmbeddingJob(scope, payloadJson, stoppingToken);
					break;
				case "classification":
					await ProcessClassificationJob(scope, payloadJson, stoppingToken);
					break;
				case "pii_detection":
					await ProcessPiiDetectionJob(scope, payloadJson, stoppingToken);
					break;
				case "weekly_digest":
					await ProcessWeeklyDigestJob(scope, payloadJson, stoppingToken);
					break;
                case "graph_enrich":
                    await ProcessGraphEnrichJob(scope, payloadJson, stoppingToken);
                    break;
				default:
					_logger.LogWarning("Unknown job type: {JobType}", jobType);
					break;
			}
		}
		catch (Exception ex)
		{
			_logger.LogError(ex, "Failed to process stream message {MessageId} from {StreamName}", message.Id, streamName);
		}
	}

    private async Task ProcessEmbeddingJob(IServiceScope scope, string payloadJson, CancellationToken stoppingToken)
    {
        var payload = JsonSerializer.Deserialize<EmbeddingJobPayload>(payloadJson);
        if (payload == null) return;

        var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
        var vector = scope.ServiceProvider.GetRequiredService<IVectorService>();
        var embed = scope.ServiceProvider.GetRequiredService<IEmbeddingService>();

        var chunk = await db.NoteChunks.Include(c => c.Note).FirstOrDefaultAsync(c => c.Id == payload.ChunkId, stoppingToken);
        if (chunk == null) return;

        var embedding = await embed.EmbedAsync(chunk.Content, stoppingToken);
        if (embedding == null) return;

        await vector.UpsertChunkAsync(chunk.Note, chunk, embedding, stoppingToken);

        // Create or update embedding record
        var existingEmbedding = await db.Embeddings.FirstOrDefaultAsync(e => e.ChunkId == chunk.Id, stoppingToken);
        if (existingEmbedding == null)
        {
            db.Embeddings.Add(new Embedding
            {
                ChunkId = chunk.Id,
                Provider = _configuration["Embedding:Provider"] ?? "openai",
                Model = _configuration["Embedding:Model"] ?? "text-embedding-3-small",
                Dim = embedding.Length,
                VectorRef = $"chunk:{chunk.Id}",
                CreatedAt = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync(stoppingToken);
    }
    
    private async Task ProcessClassificationJob(IServiceScope scope, string payloadJson, CancellationToken stoppingToken)
    {
        var payload = JsonSerializer.Deserialize<ClassificationJobPayload>(payloadJson);
        if (payload == null) return;

        var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
        var classification = scope.ServiceProvider.GetRequiredService<IClassificationService>();

        var note = await db.Notes.FindAsync(new object[] { payload.NoteId }, stoppingToken);
        if (note == null) return;

        var result = await classification.ClassifyTextAsync(note.Content);
        
        // Update note with classification results
        note.SensitivityLevel = result.SensitivityLevel;
        note.Tags = string.Join(",", result.Tags.Take(5).Select(t => t.Name)); // Limit to top 5 tags
        note.PiiFlags = JsonSerializer.Serialize(result.PiiFlags);
        note.SecretFlags = JsonSerializer.Serialize(result.SecretFlags);
        note.Summary = result.Summary;

        await db.SaveChangesAsync(stoppingToken);
    }
    
    private async Task ProcessPiiDetectionJob(IServiceScope scope, string payloadJson, CancellationToken stoppingToken)
    {
        var payload = JsonSerializer.Deserialize<PiiDetectionJobPayload>(payloadJson);
        if (payload == null) return;

        var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
        var piiDetection = scope.ServiceProvider.GetRequiredService<IPiiDetectionService>();

        var note = await db.Notes.FindAsync(new object[] { payload.NoteId }, stoppingToken);
        if (note == null) return;

        var piiSpans = await piiDetection.DetectPiiAsync(note.Content);
        
        // Update note with PII detection results
        note.PiiFlags = JsonSerializer.Serialize(piiSpans);

        await db.SaveChangesAsync(stoppingToken);
    }
    
    private async Task ProcessWeeklyDigestJob(IServiceScope scope, string payloadJson, CancellationToken stoppingToken)
    {
        var payload = JsonSerializer.Deserialize<WeeklyDigestJobPayload>(payloadJson);
        if (payload == null) return;

        var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
        var notificationService = scope.ServiceProvider.GetRequiredService<INotificationService>();

        var profile = await db.UserProfiles.FindAsync(new object[] { payload.UserProfileId }, stoppingToken);
        if (profile == null) return;

        // Check if user has weekly digest enabled
        var preferences = await notificationService.GetNotificationPreferencesAsync(profile);
        if (!preferences.WeeklyDigest) return;

        // Generate weekly digest content
        var digestContent = await GenerateWeeklyDigestAsync(db, profile.Id, stoppingToken);
        
        // Send the digest
        await notificationService.SendWeeklyDigestAsync(profile, digestContent);
    }

    private async Task ProcessGraphEnrichJob(IServiceScope scope, string payloadJson, CancellationToken stoppingToken)
    {
        var payload = JsonSerializer.Deserialize<GraphEnrichJobPayload>(payloadJson) ?? new GraphEnrichJobPayload();
        await SweepGraphAsync(scope, stoppingToken, payload.NoteId);
    }

    private async Task SweepGraphAsync(IServiceScope scope, CancellationToken ct, string? singleNoteId = null)
    {
        var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
        var ner = scope.ServiceProvider.GetRequiredService<INerService>();
        var graph = scope.ServiceProvider.GetRequiredService<IGraphService>();

        // Choose notes to process
        var notesQuery = db.Notes.AsQueryable();
        if (!string.IsNullOrEmpty(singleNoteId))
        {
            notesQuery = notesQuery.Where(n => n.Id == singleNoteId);
        }
        else
        {
            // Process a batch of recent notes each sweep
            notesQuery = notesQuery.OrderByDescending(n => n.UpdatedAt).Take(50);
        }

        var notes = await notesQuery.ToListAsync(ct);
        foreach (var note in notes)
        {
            try
            {
                var text = note.Content;
                if (string.IsNullOrWhiteSpace(text))
                {
                    // fallback: concatenate chunks
                    text = string.Join("\n", db.NoteChunks.Where(c => c.NoteId == note.Id).OrderBy(c => c.ChunkIndex).Select(c => c.Content));
                }
                if (string.IsNullOrWhiteSpace(text)) continue;

                var extractions = await ner.ExtractEntitiesAsync(text);
                var canonicalEntities = new List<Entity>();
                foreach (var ex in extractions)
                {
                    var ent = await ner.GetOrCreateCanonicalEntityAsync(ex.Type, ex.Value, ex.Confidence);
                    canonicalEntities.Add(ent);
                }
                if (canonicalEntities.Count > 1)
                {
                    await graph.CreateEntityRelationsAsync(canonicalEntities.Distinct().ToList(), note.Id);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Graph enrichment failed for note {NoteId}", note.Id);
            }
        }
    }

    private async Task<string> GenerateWeeklyDigestAsync(CortexDbContext db, string userProfileId, CancellationToken stoppingToken)
    {
        var weekAgo = DateTime.UtcNow.AddDays(-7);
        
        // Get user's subject ID to filter notes
        var profile = await db.UserProfiles.FindAsync(new object[] { userProfileId }, stoppingToken);
        if (profile == null) return "No activity this week.";
        
        var userId = profile.SubjectId;
        
        // Get notes created in the last week
        var newNotes = await db.Notes
            .Where(n => n.UserId == userId && n.CreatedAt >= weekAgo && !n.IsDeleted)
            .CountAsync(stoppingToken);
        
        // Get most used tags
        var topTags = await db.NoteTags
            .Where(nt => db.Notes.Any(n => n.Id == nt.NoteId && n.UserId == userId && n.CreatedAt >= weekAgo && !n.IsDeleted))
            .Join(db.Tags, nt => nt.TagId, t => t.Id, (nt, t) => t.Name)
            .GroupBy(name => name)
            .Select(g => new { Tag = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .Take(3)
            .ToListAsync(stoppingToken);
        
        // Get achievement count for the week
        var newAchievements = await db.UserAchievements
            .Where(ua => ua.UserProfileId == userProfileId && ua.EarnedAt >= weekAgo)
            .CountAsync(stoppingToken);
        
        // Build digest content
        var digestLines = new List<string>
        {
            $"? Your Cortex Week in Review",
            "",
            $"?? Notes Created: {newNotes}",
        };
        
        if (topTags.Any())
        {
            digestLines.Add($"??? Top Tags: {string.Join(", ", topTags.Select(t => $"{t.Tag} ({t.Count})"))}");
        }
        
        if (newAchievements > 0)
        {
            digestLines.Add($"?? New Achievements: {newAchievements}");
        }
        
        if (newNotes == 0)
        {
            digestLines.Add("");
            digestLines.Add("?? Tip: Try adding some notes this week to build your knowledge base!");
        }
        else if (newNotes >= 10)
        {
            digestLines.Add("");
            digestLines.Add("?? Great job staying productive! You're building an impressive knowledge base.");
        }
        
        return string.Join("\n", digestLines);
    }
}
