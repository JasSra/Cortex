using StackExchange.Redis;
using System.Text.Json;
using CortexApi.Models;
using Microsoft.Extensions.DependencyInjection;

namespace CortexApi.Services;

public interface IVectorService
{
    Task EnsureIndexAsync(int dim, CancellationToken ct = default);
    Task EnqueueEmbedAsync(Note note, NoteChunk chunk, CancellationToken ct = default);
    Task UpsertChunkAsync(Note note, NoteChunk chunk, float[] embedding, CancellationToken ct = default);
    Task<List<(string chunkId, double score)>> KnnAsync(float[] query, int topK, string? userId, CancellationToken ct = default);
    Task RemoveNoteAsync(string noteId, CancellationToken ct = default);
}

public class VectorService : IVectorService
{
    private readonly IServiceScopeFactory _serviceScopeFactory;
    private readonly ILogger<VectorService> _logger;
    private ConnectionMultiplexer? _redis;
    private IDatabase? _db;
    private bool _connected;

    public VectorService(IServiceScopeFactory serviceScopeFactory, ILogger<VectorService> logger)
    {
        _serviceScopeFactory = serviceScopeFactory;
        _logger = logger;

        _connected = false;
    }

    private void EnsureConnected()
    {
        if (_connected) return;

        using var scope = _serviceScopeFactory.CreateScope();
        var configurationService = scope.ServiceProvider.GetRequiredService<IConfigurationService>();
        var config = configurationService.GetConfiguration();
        
        var conn = config["REDIS_CONNECTION"] ?? config["Redis:Connection"];
        if (string.IsNullOrWhiteSpace(conn))
        {
            // No connection configured; skip
            return;
        }
        try
        {
            _redis = ConnectionMultiplexer.Connect(conn);
            _db = _redis.GetDatabase();
            _connected = true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis connection not available; vector features disabled");
            _connected = false;
        }
    }

    public async Task EnsureIndexAsync(int dim, CancellationToken ct = default)
    {
        // Use RediSearch FT.CREATE if not exists. Simple check via FT._LIST or try-catch.
    EnsureConnected();
    if (!_connected || _redis is null || _db is null) return;
    var ftClient = _redis.GetServer(_redis.GetEndPoints()[0]);
        try
        {
            // Try to list index info; if fails, create
            await _db.ExecuteAsync("FT.INFO", "idx:chunks");
        }
        catch
        {
            // Create index on JSON docs at key prefix chunk:
            // VECTOR HNSW fields: $.embedding
            var schemaArgs = new List<object?>
            {
                "idx:chunks",
                "ON","JSON",
                "PREFIX","1","chunk:",
                "SCHEMA",
                "$.noteId","AS","noteId","TAG",
                "$.userId","AS","userId","TAG",
                "$.title","AS","title","TEXT","WEIGHT","1",
                "$.text","AS","text","TEXT","WEIGHT","1",
                "$.createdAt","AS","createdAt","NUMERIC",
                "$.embedding","AS","embedding","VECTOR","HNSW","6",
                "TYPE","FLOAT32","DIM",dim.ToString(),"DISTANCE_METRIC","COSINE"
            };
            await _db.ExecuteAsync("FT.CREATE", schemaArgs.ToArray() as object[] ?? schemaArgs.Cast<object>().ToArray());
        }
    }

    public async Task EnqueueEmbedAsync(Note note, NoteChunk chunk, CancellationToken ct = default)
    {
        // Route embedding requests to Hangfire instead of Redis streams
        try
        {
            using var scope = _serviceScopeFactory.CreateScope();
            var jobs = scope.ServiceProvider.GetRequiredService<IBackgroundJobService>();
            await jobs.EnqueueJobAsync("embedding", new EmbeddingJobPayload { ChunkId = chunk.Id }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to enqueue embedding job to Hangfire for Chunk {ChunkId}", chunk.Id);
        }
    }

    public async Task UpsertChunkAsync(Note note, NoteChunk chunk, float[] embedding, CancellationToken ct = default)
    {
    EnsureConnected();
    if (!_connected || _db is null) return;
    var key = $"chunk:{chunk.Id}";
        var doc = new
        {
            noteId = note.Id,
            userId = note.UserId,
            title = note.Title,
            labels = Array.Empty<string>(),
            createdAt = note.CreatedAt.ToUniversalTime().Ticks,
            text = chunk.Content,
            embedding = embedding
        };
        var json = JsonSerializer.Serialize(doc);
        await _db.ExecuteAsync("JSON.SET", key, "$", json);
    }

    public async Task<List<(string chunkId, double score)>> KnnAsync(float[] query, int topK, string? userId, CancellationToken ct = default)
    {
        // Use FT.SEARCH with KNN vector query
        var list = new List<(string chunkId, double score)>();
        EnsureConnected();
        if (!_connected || _db is null) return list;

        var blob = new byte[query.Length * sizeof(float)];
        Buffer.BlockCopy(query, 0, blob, 0, blob.Length);

        // TAG filter on userId if provided
        var filter = string.IsNullOrWhiteSpace(userId) ? "*" : $"@userId:{{{userId}}}";

        // Request the vector distance via __score and sort ascending (smaller distance is better)
        var args = new List<object?>
        {
            "idx:chunks",
            filter,
            "KNN", topK.ToString(), "@embedding", "$vec_blob",
            "PARAMS","2","vec_blob", blob,
            "SORTBY","__score",
            "RETURN","1","__score",
            "LIMIT","0", topK.ToString(),
            "DIALECT","2"
        };

        try
        {
            var res = await _db.ExecuteAsync("FT.SEARCH", args.ToArray() as object[] ?? args.Cast<object>().ToArray());
            if (res.IsNull) return list;

            var arr = (StackExchange.Redis.RedisResult[]?)res;
            if (arr == null || arr.Length <= 1) return list; // first element is total count

            // Results come as: total, key1, [fieldName, fieldValue, ...], key2, [..], ...
            for (int i = 1; i < arr.Length; i += 2)
            {
                var key = arr[i].ToString() ?? string.Empty;
                string chunkId = key.StartsWith("chunk:") ? key.Substring("chunk:".Length) : key;
                double distance = 0.0;

                if (i + 1 < arr.Length && arr[i + 1].Resp2Type == StackExchange.Redis.ResultType.Array)
                {
                    var fields = (StackExchange.Redis.RedisResult[]?)arr[i + 1];
                    if (fields != null)
                    {
                        for (int f = 0; f + 1 < fields.Length; f += 2)
                        {
                            var name = fields[f].ToString();
                            if (string.Equals(name, "__score", StringComparison.Ordinal))
                            {
                                double.TryParse(fields[f + 1].ToString(), out distance);
                                break;
                            }
                        }
                    }
                }

                // Convert cosine distance (0..2) to similarity (1 - distance), clamp to [0,1]
                var similarity = Math.Max(0.0, Math.Min(1.0, 1.0 - distance));
                list.Add((chunkId, similarity));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Vector KNN search failed; returning empty results");
        }

        return list;
    }

    public async Task RemoveNoteAsync(string noteId, CancellationToken ct = default)
    {
    EnsureConnected();
    if (!_connected || _db is null) return;
        try
        {
            // Use FT.SEARCH to find chunk keys by TAG noteId and delete them
            var args = new List<object?>
            {
                "idx:chunks",
                $"@noteId:{{{noteId}}}",
                "RETURN","0",
                "LIMIT","0","10000",
                "DIALECT","2"
            };
            var res = await _db.ExecuteAsync("FT.SEARCH", args.ToArray() as object[] ?? args.Cast<object>().ToArray());
            if (res.IsNull) return;

            var arr = (StackExchange.Redis.RedisResult[]?)res;
            if (arr == null || arr.Length <= 1) return; // first element is total count

            for (int i = 1; i < arr.Length; i += 2)
            {
                var key = arr[i].ToString();
                if (!string.IsNullOrEmpty(key))
                {
                    await _db.KeyDeleteAsync(key);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to remove Redis vectors for note {NoteId}", noteId);
        }
    }
}
