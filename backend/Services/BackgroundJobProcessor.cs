using System.Text.Json;
using CortexApi.Data;
using CortexApi.Models;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Services;

public class BackgroundJobProcessor : IBackgroundJobProcessor
{
	private readonly IServiceScopeFactory _scopeFactory;
	private readonly ILogger<BackgroundJobProcessor> _logger;
	private readonly IConfiguration _configuration;

	public BackgroundJobProcessor(
		IServiceScopeFactory scopeFactory, 
		ILogger<BackgroundJobProcessor> logger, 
		IConfiguration configuration)
	{
		_scopeFactory = scopeFactory;
		_logger = logger;
		_configuration = configuration;
	}

	public async Task ProcessEmbeddingJobAsync(string chunkId, CancellationToken ct = default)
	{
		_logger.LogInformation("Processing embedding job for chunk {ChunkId}", chunkId);

		using var scope = _scopeFactory.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
		var vector = scope.ServiceProvider.GetRequiredService<IVectorService>();
		var embed = scope.ServiceProvider.GetRequiredService<IEmbeddingService>();

		var chunk = await db.NoteChunks.Include(c => c.Note).FirstOrDefaultAsync(c => c.Id == chunkId, ct);
		if (chunk == null) 
		{
			_logger.LogWarning("Chunk {ChunkId} not found for embedding job", chunkId);
			return;
		}

		// Early exit if already embedded
		if (await db.Embeddings.AsNoTracking().AnyAsync(e => e.ChunkId == chunk.Id, ct))
		{
			_logger.LogInformation("Chunk {ChunkId} already has embedding, skipping", chunkId);
			return;
		}

		_logger.LogInformation("Creating embedding for chunk {ChunkId} with content length {ContentLength}", 
			chunkId, chunk.Content.Length);

		var (embedding, usedCache) = await TryGetOrCreateVectorAsync(db, embed, chunk.Content, ct);
		if (embedding == null) 
		{
			_logger.LogWarning("Failed to create embedding for chunk {ChunkId}", chunkId);
			return;
		}

		await vector.UpsertChunkAsync(chunk.Note, chunk, embedding, ct);

		// Create embedding record
		db.Embeddings.Add(new Embedding
		{
			ChunkId = chunk.Id,
			Provider = _configuration["Embedding:Provider"] ?? "openai",
			Model = _configuration["Embedding:Model"] ?? "text-embedding-3-small",
			Dim = embedding.Length,
			VectorRef = $"chunk:{chunk.Id}",
			CreatedAt = DateTime.UtcNow
		});

		await db.SaveChangesAsync(ct);
		
		_logger.LogInformation("Successfully completed embedding job for chunk {ChunkId}", chunkId);
	}

	public async Task ProcessClassificationJobAsync(string noteId, CancellationToken ct = default)
	{
		_logger.LogInformation("Processing classification job for note {NoteId}", noteId);

		using var scope = _scopeFactory.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
		var classification = scope.ServiceProvider.GetRequiredService<IClassificationService>();

		var note = await db.Notes.FindAsync(new object[] { noteId }, ct);
		if (note == null) 
		{
			_logger.LogWarning("Note {NoteId} not found for classification job", noteId);
			return;
		}

		var result = await classification.ClassifyTextAsync(note.Content);
		
		// Update note with classification results
		note.SensitivityLevel = result.SensitivityLevel;
		note.Tags = string.Join(",", result.Tags.Take(5).Select(t => t.Name)); // Limit to top 5 tags
		note.PiiFlags = JsonSerializer.Serialize(result.PiiFlags);
		note.SecretFlags = JsonSerializer.Serialize(result.SecretFlags);
		note.Summary = result.Summary;

		await db.SaveChangesAsync(ct);
		
		_logger.LogInformation("Successfully completed classification job for note {NoteId}", noteId);
	}

	public async Task ProcessPiiDetectionJobAsync(string noteId, CancellationToken ct = default)
	{
		_logger.LogInformation("Processing PII detection job for note {NoteId}", noteId);

		using var scope = _scopeFactory.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
		var piiDetection = scope.ServiceProvider.GetRequiredService<IPiiDetectionService>();

		var note = await db.Notes.FindAsync(new object[] { noteId }, ct);
		if (note == null) 
		{
			_logger.LogWarning("Note {NoteId} not found for PII detection job", noteId);
			return;
		}

		var piiSpans = await piiDetection.DetectPiiAsync(note.Content);
		
		// Update note with PII detection results
		note.PiiFlags = JsonSerializer.Serialize(piiSpans);

		await db.SaveChangesAsync(ct);
		
		_logger.LogInformation("Successfully completed PII detection job for note {NoteId}", noteId);
	}

	public async Task ProcessWeeklyDigestJobAsync(string userProfileId, CancellationToken ct = default)
	{
		_logger.LogInformation("Processing weekly digest job for user {UserProfileId}", userProfileId);

		using var scope = _scopeFactory.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
		var notificationService = scope.ServiceProvider.GetRequiredService<INotificationService>();

		var profile = await db.UserProfiles.FindAsync(new object[] { userProfileId }, ct);
		if (profile == null) 
		{
			_logger.LogWarning("User profile {UserProfileId} not found for weekly digest job", userProfileId);
			return;
		}

		// Check if user has weekly digest enabled
		var preferences = await notificationService.GetNotificationPreferencesAsync(profile);
		if (!preferences.WeeklyDigest) 
		{
			_logger.LogInformation("Weekly digest disabled for user {UserProfileId}", userProfileId);
			return;
		}

		// Generate weekly digest content
		var digestContent = await GenerateWeeklyDigestAsync(db, profile.Id, ct);
		
		// Send the digest
		await notificationService.SendWeeklyDigestAsync(profile, digestContent);
		
		_logger.LogInformation("Successfully completed weekly digest job for user {UserProfileId}", userProfileId);
	}

	public async Task ProcessGraphEnrichJobAsync(string? noteId = null, CancellationToken ct = default)
	{
		_logger.LogInformation("Processing graph enrichment job for note {NoteId}", noteId ?? "batch");

		using var scope = _scopeFactory.CreateScope();
		await SweepGraphAsync(scope, ct, noteId);
		
		_logger.LogInformation("Successfully completed graph enrichment job");
	}

	private async Task<(float[]? vec, bool usedCache)> TryGetOrCreateVectorAsync(CortexDbContext db, IEmbeddingService embed, string text, CancellationToken ct)
	{
		string NormalizeForHash(string input)
		{
			if (string.IsNullOrEmpty(input)) return string.Empty;
			var lf = input.Replace("\r\n", "\n").Replace("\r", "\n");
			var sb = new System.Text.StringBuilder(lf.Length);
			bool lastSpace = false;
			foreach (var ch in lf)
			{
				char c = ch;
				if (char.IsWhiteSpace(c) && c != '\n') c = ' ';
				if (c == ' ')
				{
					if (lastSpace) continue;
					lastSpace = true;
				}
				else lastSpace = false;
				sb.Append(char.ToLowerInvariant(c));
			}
			return sb.ToString().Trim();
		}

		var provider = _configuration["Embedding:Provider"] ?? "openai";
		var model = _configuration["Embedding:Model"] ?? "text-embedding-3-small";

		// Hash normalized text
		using var sha = System.Security.Cryptography.SHA256.Create();
		var norm = NormalizeForHash(text);
		var hash = Convert.ToHexString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(norm))).ToLowerInvariant();

		// Lookup cache
		var cached = await db.EmbeddingCache.AsNoTracking()
			.FirstOrDefaultAsync(e => e.TextHash == hash && e.Provider == provider && e.Model == model, ct);
		if (cached != null)
		{
			try
			{
				var vec = JsonSerializer.Deserialize<float[]>(cached.VectorJson);
				if (vec != null && vec.Length == embed.GetEmbeddingDim())
					return (vec, true);
			}
			catch { /* fall through to re-embed */ }
		}

		var created = await embed.EmbedAsync(text, ct);
		if (created == null) return (null, false);

		// Store in cache
		try
		{
			db.EmbeddingCache.Add(new EmbeddingCache
			{
				TextHash = hash,
				Provider = provider,
				Model = model,
				Dim = created.Length,
				VectorJson = JsonSerializer.Serialize(created),
				CreatedAt = DateTime.UtcNow
			});
			await db.SaveChangesAsync(ct);
		}
		catch
		{
			// Best-effort cache write, ignore uniqueness races
		}

		return (created, false);
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

	private async Task<string> GenerateWeeklyDigestAsync(CortexDbContext db, string userProfileId, CancellationToken ct)
	{
		var weekAgo = DateTime.UtcNow.AddDays(-7);
		
		// Get user's subject ID to filter notes
		var profile = await db.UserProfiles.FindAsync(new object[] { userProfileId }, ct);
		if (profile == null) return "No activity this week.";
		
		var userId = profile.SubjectId;
		
		// Get notes created in the last week
		var newNotes = await db.Notes
			.Where(n => n.UserId == userId && n.CreatedAt >= weekAgo && !n.IsDeleted)
			.CountAsync(ct);
		
		// Get most used tags
		var topTags = await db.NoteTags
			.Where(nt => db.Notes.Any(n => n.Id == nt.NoteId && n.UserId == userId && n.CreatedAt >= weekAgo && !n.IsDeleted))
			.Join(db.Tags, nt => nt.TagId, t => t.Id, (nt, t) => t.Name)
			.GroupBy(name => name)
			.Select(g => new { Tag = g.Key, Count = g.Count() })
			.OrderByDescending(x => x.Count)
			.Take(3)
			.ToListAsync(ct);
		
		// Get achievement count for the week
		var newAchievements = await db.UserAchievements
			.Where(ua => ua.UserProfileId == userProfileId && ua.EarnedAt >= weekAgo)
			.CountAsync(ct);
		
		// Build digest content
		var digestLines = new List<string>
		{
			$"📊 Your Cortex Week in Review",
			"",
			$"📝 Notes Created: {newNotes}",
		};
		
		if (topTags.Any())
		{
			digestLines.Add($"🏷️ Top Tags: {string.Join(", ", topTags.Select(t => $"{t.Tag} ({t.Count})"))}");
		}
		
		if (newAchievements > 0)
		{
			digestLines.Add($"🏆 New Achievements: {newAchievements}");
		}
		
		if (newNotes == 0)
		{
			digestLines.Add("");
			digestLines.Add("💡 Tip: Try adding some notes this week to build your knowledge base!");
		}
		
		return string.Join("\n", digestLines);
	}
}
