using System.Text;
using System.Text.Json;
using CortexApi.Data;
using CortexApi.Services.Providers;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Services;

public interface IEmbeddingService
{
    Task<float[]?> EmbedAsync(string text, CancellationToken ct = default);
    int GetEmbeddingDim();
    Task ReembedChunkAsync(string chunkId, CancellationToken ct = default);
}

public class EmbeddingService : IEmbeddingService
{
    private readonly IEmbeddingProvider _embeddingProvider;
    private readonly ILogger<EmbeddingService> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public EmbeddingService(IEmbeddingProvider embeddingProvider, ILogger<EmbeddingService> logger, IServiceScopeFactory scopeFactory)
    {
        _embeddingProvider = embeddingProvider;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    public int GetEmbeddingDim()
    {
        return _embeddingProvider.EmbeddingDimension;
    }

    public async Task<float[]?> EmbedAsync(string text, CancellationToken ct = default)
    {
        try
        {
            var result = await _embeddingProvider.GenerateEmbeddingAsync(text, ct: ct);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate embedding for text of length {Length}", text.Length);
            
            // Fallback to local hash-based embedding for development
            _logger.LogWarning("Falling back to local hash-based embeddings (dev mode)");
            return LocalEmbed(text);
        }
    }

    private float[] LocalEmbed(string text)
    {
        var dimLocal = GetEmbeddingDim();
        var vec = new float[dimLocal];
        unchecked
        {
            int h = 17;
            foreach (var ch in text)
            {
                h = h * 31 + ch;
                var idx = Math.Abs(h) % dimLocal;
                vec[idx] += 1f;
            }
        }
        // L2 normalize
        var norm = MathF.Sqrt(vec.Sum(v => v * v));
        if (norm > 0)
        {
            for (int i = 0; i < vec.Length; i++) vec[i] /= norm;
        }
        return vec;
    }

    private static string Truncate(string s, int max)
        => string.IsNullOrEmpty(s) || s.Length <= max ? s : s.Substring(0, max) + "…";

    public async Task ReembedChunkAsync(string chunkId, CancellationToken ct = default)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
            var vectorService = scope.ServiceProvider.GetRequiredService<IVectorService>();

            var chunk = await db.NoteChunks
                .Include(c => c.Note)
                .Include(c => c.Embeddings)
                .FirstOrDefaultAsync(c => c.Id == chunkId, ct);

            if (chunk == null)
            {
                _logger.LogWarning("Chunk {ChunkId} not found for re-embedding", chunkId);
                return;
            }

            // Remove existing embeddings
            if (chunk.Embeddings.Any())
            {
                db.Embeddings.RemoveRange(chunk.Embeddings);
            }

            // Generate new embedding
            var embedding = await EmbedAsync(chunk.Content, ct);
            if (embedding != null && embedding.Length > 0)
            {
                // Store in vector service
                await vectorService.UpsertChunkAsync(chunk.Note, chunk, embedding, ct);

                // Create new embedding record
                var embeddingRecord = new Models.Embedding
                {
                    ChunkId = chunk.Id,
                    Provider = _embeddingProvider.Name,
                    Model = "auto", // Provider determines model
                    Dim = embedding.Length,
                    VectorRef = $"chunk:{chunk.Id}",
                    CreatedAt = DateTime.UtcNow
                };

                db.Embeddings.Add(embeddingRecord);
                await db.SaveChangesAsync(ct);

                _logger.LogDebug("Successfully re-embedded chunk {ChunkId}", chunkId);
            }
            else
            {
                _logger.LogError("Failed to generate embedding for chunk {ChunkId}", chunkId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error re-embedding chunk {ChunkId}", chunkId);
            throw;
        }
    }
}
