using System.Text.Json;
using CortexApi.Data;
using CortexApi.Models;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Services;

public class BackgroundJobService : BackgroundService
{
	private readonly IServiceScopeFactory _scopeFactory;
	private readonly ILogger<BackgroundJobService> _logger;
	private bool _indexEnsured = false;
	private readonly HashSet<string> _inProgress = new();
	private readonly object _lock = new();
	private int _idleStreak = 0;

	public BackgroundJobService(IServiceScopeFactory scopeFactory, ILogger<BackgroundJobService> logger)
	{
		_scopeFactory = scopeFactory;
		_logger = logger;
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken)
	{
		// Delay a moment for app startup
		await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);

		while (!stoppingToken.IsCancellationRequested)
		{
			try
			{
				using var scope = _scopeFactory.CreateScope();
				var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
				var vector = scope.ServiceProvider.GetRequiredService<IVectorService>();
				var embed = scope.ServiceProvider.GetRequiredService<IEmbeddingService>();

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

				// Simple polling of stream:embed via Redis Streams read with XREAD COUNT 32 BLOCK 1000
				// Using IVectorService doesn't expose streams read; we'll approximate by noop delay.
				// In a real implementation, we'd XREAD; here, process any chunks lacking embeddings.

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

					db.Embeddings.Add(new Embedding
					{
						ChunkId = chunk.Id,
						Provider = (scope.ServiceProvider.GetRequiredService<IConfiguration>()["Embedding:Provider"] ?? "openai"),
						Model = (scope.ServiceProvider.GetRequiredService<IConfiguration>()["Embedding:Model"] ?? "text-embedding-3-small"),
						Dim = vec.Length,
						VectorRef = $"chunk:{chunk.Id}"
					});
					// Mark as done in local set once tracked in DbContext
					lock (_lock) { _inProgress.Remove(chunk.Id); }
				}

				if (work.Count > 0)
				{
					await db.SaveChangesAsync(stoppingToken);
				}

				// Backoff: short delay when work was done, exponential when idle
				_idleStreak = work.Count > 0 ? 0 : Math.Min(_idleStreak + 1, 6);
				var idleSeconds = work.Count > 0 ? 0.2 : Math.Min(30, Math.Pow(2, _idleStreak));
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
}
