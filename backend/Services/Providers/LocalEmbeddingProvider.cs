using System.Text;
using System.Text.Json;

namespace CortexApi.Services.Providers;

/// <summary>
/// Local embedding provider using various models (SentenceTransformers, etc.)
/// </summary>
public class LocalEmbeddingProvider : IEmbeddingProvider
{
    private readonly HttpClient _httpClient;
    private readonly IConfigurationService _configurationService;
    private readonly ILogger<LocalEmbeddingProvider> _logger;

    public string Name => "local";

    public int EmbeddingDimension 
    { 
        get 
        {
            var config = _configurationService.GetConfiguration();
            if (int.TryParse(config["Embedding:Dim"], out var dim))
                return dim;
            return 384; // Default for all-MiniLM-L6-v2
        }
    }

    public LocalEmbeddingProvider(HttpClient httpClient, IConfigurationService configurationService, ILogger<LocalEmbeddingProvider> logger)
    {
        _httpClient = httpClient;
        _configurationService = configurationService;
        _logger = logger;
    }

    public async Task<List<string>> GetAvailableModelsAsync()
    {
        return new List<string>
        {
            "all-MiniLM-L6-v2",
            "all-mpnet-base-v2",
            "paraphrase-MiniLM-L3-v2",
            "multi-qa-MiniLM-L6-cos-v1"
        };
    }

    public async Task<ProviderValidationResult> ValidateConfigurationAsync()
    {
        var result = new ProviderValidationResult();
        var config = _configurationService.GetConfiguration();
        
        var endpoint = config["LocalEmbedding:Endpoint"] ?? "http://localhost:5000";
        
        try
        {
            // Test connection to local embedding service
            using var response = await _httpClient.GetAsync($"{endpoint}/health");
            
            if (response.IsSuccessStatusCode)
            {
                result.IsValid = true;
                result.Metadata["status"] = "Local embedding service is accessible";
                result.Metadata["endpoint"] = endpoint;
                result.Metadata["embedding_dimension"] = EmbeddingDimension;
            }
            else
            {
                result.Errors.Add($"Local embedding service not accessible: {response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            result.Errors.Add($"Failed to connect to local embedding service: {ex.Message}");
            result.Warnings.Add("Ensure local embedding service is running");
        }

        return result;
    }

    public async Task<float[]?> GenerateEmbeddingAsync(string text, EmbeddingOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var endpoint = config["LocalEmbedding:Endpoint"] ?? "http://localhost:5000";
        var model = options?.Model ?? config["Embedding:Model"] ?? "all-MiniLM-L6-v2";

        var request = new
        {
            model,
            text,
            normalize = true
        };

        try
        {
            using var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync($"{endpoint}/embed", content, ct);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("Local embedding failed: {Status} {Body}", response.StatusCode, errorBody);
                return null;
            }

            var responseBody = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(responseBody);
            
            // Handle different response formats
            JsonElement embeddingElement;
            if (doc.RootElement.TryGetProperty("embedding", out embeddingElement))
            {
                // Format: { "embedding": [1.0, 2.0, ...] }
                var embedding = new float[embeddingElement.GetArrayLength()];
                var i = 0;
                foreach (var value in embeddingElement.EnumerateArray())
                {
                    embedding[i++] = value.GetSingle();
                }
                return embedding;
            }
            else if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                // Format: [1.0, 2.0, ...]
                var embedding = new float[doc.RootElement.GetArrayLength()];
                var i = 0;
                foreach (var value in doc.RootElement.EnumerateArray())
                {
                    embedding[i++] = value.GetSingle();
                }
                return embedding;
            }

            _logger.LogError("Unexpected response format from local embedding service");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Local embedding error");
            return null;
        }
    }

    public async Task<List<float[]?>> GenerateEmbeddingsAsync(List<string> texts, EmbeddingOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var endpoint = config["LocalEmbedding:Endpoint"] ?? "http://localhost:5000";
        var model = options?.Model ?? config["Embedding:Model"] ?? "all-MiniLM-L6-v2";

        var request = new
        {
            model,
            texts = texts.ToArray(),
            normalize = true
        };

        try
        {
            using var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync($"{endpoint}/embed_batch", content, ct);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("Local batch embedding failed: {Status} {Body}", response.StatusCode, errorBody);
                return texts.Select(_ => (float[]?)null).ToList();
            }

            var responseBody = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(responseBody);
            
            var embeddings = new List<float[]?>();
            
            // Handle different response formats
            JsonElement embeddingsElement;
            if (doc.RootElement.TryGetProperty("embeddings", out embeddingsElement))
            {
                // Format: { "embeddings": [[1.0, 2.0, ...], [3.0, 4.0, ...]] }
                foreach (var embeddingData in embeddingsElement.EnumerateArray())
                {
                    var embedding = new float[embeddingData.GetArrayLength()];
                    var i = 0;
                    foreach (var value in embeddingData.EnumerateArray())
                    {
                        embedding[i++] = value.GetSingle();
                    }
                    embeddings.Add(embedding);
                }
            }
            else if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                // Format: [[1.0, 2.0, ...], [3.0, 4.0, ...]]
                foreach (var embeddingData in doc.RootElement.EnumerateArray())
                {
                    var embedding = new float[embeddingData.GetArrayLength()];
                    var i = 0;
                    foreach (var value in embeddingData.EnumerateArray())
                    {
                        embedding[i++] = value.GetSingle();
                    }
                    embeddings.Add(embedding);
                }
            }
            else
            {
                _logger.LogError("Unexpected response format from local embedding service");
                return texts.Select(_ => (float[]?)null).ToList();
            }

            return embeddings;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Local batch embedding error");
            return texts.Select(_ => (float[]?)null).ToList();
        }
    }
}
