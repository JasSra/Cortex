using System.Text;
using System.Text.Json;

namespace CortexApi.Services.Providers;

/// <summary>
/// OpenAI implementation of IEmbeddingProvider
/// </summary>
public class OpenAiEmbeddingProvider : IEmbeddingProvider
{
    private readonly HttpClient _httpClient;
    private readonly IConfigurationService _configurationService;
    private readonly ILogger<OpenAiEmbeddingProvider> _logger;

    public string Name => "openai";

    public int EmbeddingDimension 
    { 
        get 
        {
            var config = _configurationService.GetConfiguration();
            if (int.TryParse(config["Embedding:Dim"], out var dim))
                return dim;
            return 1536; // Default for text-embedding-3-small
        }
    }

    public OpenAiEmbeddingProvider(HttpClient httpClient, IConfigurationService configurationService, ILogger<OpenAiEmbeddingProvider> logger)
    {
        _httpClient = httpClient;
        _configurationService = configurationService;
        _logger = logger;
    }

    public async Task<List<string>> GetAvailableModelsAsync()
    {
        return new List<string>
        {
            "text-embedding-3-small",
            "text-embedding-3-large", 
            "text-embedding-ada-002"
        };
    }

    public async Task<ProviderValidationResult> ValidateConfigurationAsync()
    {
        var result = new ProviderValidationResult();
        var config = _configurationService.GetConfiguration();
        
        var apiKey = config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            result.Errors.Add("OpenAI API key is required");
            return result;
        }

        if (!apiKey.StartsWith("sk-"))
        {
            result.Warnings.Add("API key format looks unusual");
        }

        try
        {
            // Test API key with a minimal embedding request
            _httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            
            var testRequest = new
            {
                model = "text-embedding-3-small",
                input = "test",
                dimensions = 512 // Small test
            };

            using var content = new StringContent(JsonSerializer.Serialize(testRequest), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync("https://api.openai.com/v1/embeddings", content);
            
            if (response.IsSuccessStatusCode)
            {
                result.IsValid = true;
                result.Metadata["status"] = "API key validated successfully";
                result.Metadata["embedding_dimension"] = EmbeddingDimension;
            }
            else
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                result.Errors.Add($"API validation failed: {response.StatusCode} - {errorBody}");
            }
        }
        catch (Exception ex)
        {
            result.Errors.Add($"API validation error: {ex.Message}");
        }

        return result;
    }

    public async Task<float[]?> GenerateEmbeddingAsync(string text, EmbeddingOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var apiKey = config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey)) return null;

        var model = options?.Model ?? config["Embedding:Model"] ?? "text-embedding-3-small";

        var request = new
        {
            model,
            input = text,
            dimensions = options?.Dimensions ?? EmbeddingDimension
        };

        // Retry logic for network issues
        const int maxRetries = 2;
        for (int attempt = 1; attempt <= maxRetries; attempt++)
        {
            try
            {
                // Create a timeout cancellation token to combine with the provided one
                using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(50)); // Conservative timeout
                using var combinedCts = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);
                
                // Clear any existing authorization header and set fresh one
                _httpClient.DefaultRequestHeaders.Authorization = null;
                _httpClient.DefaultRequestHeaders.Authorization = 
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

                var jsonContent = JsonSerializer.Serialize(request);
                using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");
                
                // Use the combined cancellation token
                using var response = await _httpClient.PostAsync("https://api.openai.com/v1/embeddings", content, combinedCts.Token);
                
                if (!response.IsSuccessStatusCode)
                {
                    var errorBody = await response.Content.ReadAsStringAsync(combinedCts.Token);
                    _logger.LogError("OpenAI embedding failed: {Status} {Body}", response.StatusCode, errorBody);
                    return null;
                }

                var responseBody = await response.Content.ReadAsStringAsync(combinedCts.Token);
                using var doc = JsonDocument.Parse(responseBody);
                
                var data = doc.RootElement.GetProperty("data")[0].GetProperty("embedding");
                var embedding = new float[data.GetArrayLength()];
                var i = 0;
                foreach (var value in data.EnumerateArray())
                {
                    embedding[i++] = value.GetSingle();
                }

                return embedding;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                _logger.LogWarning("OpenAI embedding request was cancelled by caller");
                throw;
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning("OpenAI embedding request timed out after 50 seconds (attempt {Attempt}/{MaxRetries})", attempt, maxRetries);
                if (attempt == maxRetries) return null;
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "OpenAI embedding HTTP request failed (attempt {Attempt}/{MaxRetries})", attempt, maxRetries);
                if (attempt == maxRetries) return null;
            }
            catch (ObjectDisposedException ex)
            {
                _logger.LogWarning(ex, "OpenAI embedding request failed due to disposed connection (attempt {Attempt}/{MaxRetries})", attempt, maxRetries);
                if (attempt == maxRetries) return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "OpenAI embedding error (attempt {Attempt}/{MaxRetries})", attempt, maxRetries);
                if (attempt == maxRetries) return null;
            }

            // Wait a bit before retry
            if (attempt < maxRetries)
            {
                await Task.Delay(500 * attempt, ct); // Exponential backoff: 500ms, 1000ms
            }
        }

        return null;
    }

    public async Task<List<float[]?>> GenerateEmbeddingsAsync(List<string> texts, EmbeddingOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var apiKey = config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey)) return texts.Select(_ => (float[]?)null).ToList();

        var model = options?.Model ?? config["Embedding:Model"] ?? "text-embedding-3-small";

        var request = new
        {
            model,
            input = texts.ToArray(),
            dimensions = options?.Dimensions ?? EmbeddingDimension
        };

        try
        {
            // Create a timeout cancellation token to combine with the provided one
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(55)); // Longer timeout for batch requests
            using var combinedCts = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);
            
            // Clear any existing authorization header and set fresh one
            _httpClient.DefaultRequestHeaders.Authorization = null;
            _httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

            var jsonContent = JsonSerializer.Serialize(request);
            using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");
            
            // Use the combined cancellation token
            using var response = await _httpClient.PostAsync("https://api.openai.com/v1/embeddings", content, combinedCts.Token);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(combinedCts.Token);
                _logger.LogError("OpenAI batch embedding failed: {Status} {Body}", response.StatusCode, errorBody);
                return texts.Select(_ => (float[]?)null).ToList();
            }

            var responseBody = await response.Content.ReadAsStringAsync(combinedCts.Token);
            using var doc = JsonDocument.Parse(responseBody);
            
            var embeddings = new List<float[]?>();
            var dataArray = doc.RootElement.GetProperty("data");
            
            foreach (var item in dataArray.EnumerateArray())
            {
                var embeddingData = item.GetProperty("embedding");
                var embedding = new float[embeddingData.GetArrayLength()];
                var i = 0;
                foreach (var value in embeddingData.EnumerateArray())
                {
                    embedding[i++] = value.GetSingle();
                }
                embeddings.Add(embedding);
            }

            return embeddings;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            _logger.LogWarning("OpenAI batch embedding request was cancelled by caller");
            throw;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("OpenAI batch embedding request timed out after 55 seconds");
            return texts.Select(_ => (float[]?)null).ToList();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "OpenAI batch embedding HTTP request failed");
            return texts.Select(_ => (float[]?)null).ToList();
        }
        catch (ObjectDisposedException ex)
        {
            _logger.LogError(ex, "OpenAI batch embedding request failed due to disposed connection");
            return texts.Select(_ => (float[]?)null).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OpenAI batch embedding error");
            return texts.Select(_ => (float[]?)null).ToList();
        }
    }
}
