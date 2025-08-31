using System.Text;
using System.Text.Json;
using CortexApi.Data;
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
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmbeddingService> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public EmbeddingService(HttpClient httpClient, IConfiguration configuration, ILogger<EmbeddingService> logger, IServiceScopeFactory scopeFactory)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    public int GetEmbeddingDim()
    {
        if (int.TryParse(_configuration["Embedding:Dim"], out var dim))
            return dim;
        // Default for OpenAI text-embedding-3-small
        return 1536;
    }

    public async Task<float[]?> EmbedAsync(string text, CancellationToken ct = default)
    {
        var provider = _configuration["Embedding:Provider"] ?? "openai";
        var model = _configuration["Embedding:Model"] ?? "text-embedding-3-small";
        var fallbackToLocal = string.Equals(_configuration["Embedding:FallbackToLocal"], "true", StringComparison.OrdinalIgnoreCase)
                               || string.Equals(_configuration["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase);

        if (provider.Equals("openai", StringComparison.OrdinalIgnoreCase))
        {
            var apiKey = _configuration["OpenAI:ApiKey"] ?? _configuration["OPENAI_API_KEY"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("OpenAI API key not configured; cannot embed using OpenAI");
                if (fallbackToLocal)
                {
                    _logger.LogWarning("Falling back to local hashing-based embeddings (dev mode)");
                    return LocalEmbed(text);
                }
                return null;
            }

            try
            {
                var payload = new
                {
                    model,
                    input = text
                };
                var json = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

                _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromSeconds(20));
                using var resp = await _httpClient.PostAsync("https://api.openai.com/v1/embeddings", json, cts.Token);
                var respText = await resp.Content.ReadAsStringAsync(ct);
                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogError("OpenAI embeddings failed: {Status} {Body}", (int)resp.StatusCode, Truncate(respText, 400));
                    if (fallbackToLocal)
                    {
                        _logger.LogWarning("Falling back to local hashing-based embeddings after OpenAI failure");
                        return LocalEmbed(text);
                    }
                    return null;
                }

                using var doc = JsonDocument.Parse(respText);
                var data = doc.RootElement.GetProperty("data")[0].GetProperty("embedding");
                var arr = new float[data.GetArrayLength()];
                var i = 0;
                foreach (var v in data.EnumerateArray())
                {
                    arr[i++] = v.GetSingle();
                }
                return arr;
            }
            catch (OperationCanceledException oce)
            {
                _logger.LogError(oce, "OpenAI embedding request timed out");
                if (fallbackToLocal)
                {
                    _logger.LogWarning("Falling back to local hashing-based embeddings after timeout");
                    return LocalEmbed(text);
                }
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "OpenAI embedding call failed");
                if (fallbackToLocal)
                {
                    _logger.LogWarning("Falling back to local hashing-based embeddings after exception");
                    return LocalEmbed(text);
                }
                return null;
            }
        }

        // Local provider placeholder: simple hashing-based embedding to allow dev without network
        return LocalEmbed(text);
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
                    Provider = _configuration["Embedding:Provider"] ?? "openai",
                    Model = _configuration["Embedding:Model"] ?? "text-embedding-3-small",
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
