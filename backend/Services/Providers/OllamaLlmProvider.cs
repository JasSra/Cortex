using System.Text;
using System.Text.Json;

namespace CortexApi.Services.Providers;

/// <summary>
/// Ollama implementation of ILlmProvider
/// </summary>
public class OllamaLlmProvider : ILlmProvider
{
    private readonly HttpClient _httpClient;
    private readonly IConfigurationService _configurationService;
    private readonly ILogger<OllamaLlmProvider> _logger;

    public string Name => "ollama";

    public OllamaLlmProvider(HttpClient httpClient, IConfigurationService configurationService, ILogger<OllamaLlmProvider> logger)
    {
        _httpClient = httpClient;
        _configurationService = configurationService;
        _logger = logger;
    }

    public async Task<List<string>> GetAvailableModelsAsync()
    {
        try
        {
            var config = _configurationService.GetConfiguration();
            var ollamaUrl = config["Ollama:BaseUrl"] ?? config["OLLAMA_URL"] ?? "http://localhost:11434";

            using var response = await _httpClient.GetAsync($"{ollamaUrl}/api/tags");
            if (!response.IsSuccessStatusCode) return new List<string>();

            var responseBody = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(responseBody);
            
            var models = new List<string>();
            if (doc.RootElement.TryGetProperty("models", out var modelsArray))
            {
                foreach (var model in modelsArray.EnumerateArray())
                {
                    if (model.TryGetProperty("name", out var nameProperty))
                    {
                        var name = nameProperty.GetString();
                        if (!string.IsNullOrEmpty(name))
                        {
                            models.Add(name);
                        }
                    }
                }
            }

            return models;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get Ollama models");
            return new List<string> { "llama3.2:3b", "llama3.1:8b", "codellama:7b" }; // fallback defaults
        }
    }

    public async Task<ProviderValidationResult> ValidateConfigurationAsync()
    {
        var result = new ProviderValidationResult();
        var config = _configurationService.GetConfiguration();
        
        var ollamaUrl = config["Ollama:BaseUrl"] ?? config["OLLAMA_URL"] ?? "http://localhost:11434";
        var defaultModel = config["Ollama:Model"] ?? config["OLLAMA_MODEL"] ?? "llama3.2:3b";

        try
        {
            // Test connection to Ollama
            using var response = await _httpClient.GetAsync($"{ollamaUrl}/api/tags");
            
            if (response.IsSuccessStatusCode)
            {
                var models = await GetAvailableModelsAsync();
                result.IsValid = true;
                result.Metadata["url"] = ollamaUrl;
                result.Metadata["available_models"] = models;
                result.Metadata["default_model"] = defaultModel;

                if (!models.Contains(defaultModel))
                {
                    result.Warnings.Add($"Default model '{defaultModel}' is not available. Available models: {string.Join(", ", models)}");
                }
            }
            else
            {
                result.Errors.Add($"Cannot connect to Ollama at {ollamaUrl}. Status: {response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            result.Errors.Add($"Ollama connection error: {ex.Message}");
        }

        return result;
    }

    public async Task<string?> GenerateCompletionAsync(string prompt, LlmCompletionOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var ollamaUrl = config["Ollama:BaseUrl"] ?? config["OLLAMA_URL"] ?? "http://localhost:11434";
        var model = options?.Model ?? config["Ollama:Model"] ?? config["OLLAMA_MODEL"] ?? "llama3.2:3b";

        var request = new
        {
            model,
            prompt,
            stream = false,
            options = new
            {
                temperature = options?.Temperature ?? 0.7,
                top_p = options?.TopP,
                top_k = options?.TopK,
                stop = options?.StopSequences
            }
        };

        try
        {
            using var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync($"{ollamaUrl}/api/generate", content, ct);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("Ollama completion failed: {Status} {Body}", response.StatusCode, errorBody);
                return null;
            }

            var responseBody = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(responseBody);
            
            return doc.RootElement.TryGetProperty("response", out var responseProp) 
                ? responseProp.GetString() 
                : null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ollama completion error");
            return null;
        }
    }

    public async Task StreamCompletionAsync(string prompt, Func<string, Task> onChunk, LlmCompletionOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var ollamaUrl = config["Ollama:BaseUrl"] ?? config["OLLAMA_URL"] ?? "http://localhost:11434";
        var model = options?.Model ?? config["Ollama:Model"] ?? config["OLLAMA_MODEL"] ?? "llama3.2:3b";

        var request = new
        {
            model,
            prompt,
            stream = true,
            options = new
            {
                temperature = options?.Temperature ?? 0.7,
                top_p = options?.TopP,
                top_k = options?.TopK,
                stop = options?.StopSequences
            }
        };

        try
        {
            using var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync($"{ollamaUrl}/api/generate", content, ct);
            
            response.EnsureSuccessStatusCode();

            using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            string? line;
            while ((line = await reader.ReadLineAsync()) != null && !ct.IsCancellationRequested)
            {
                if (!string.IsNullOrWhiteSpace(line))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(line);
                        if (doc.RootElement.TryGetProperty("response", out var responseProp))
                        {
                            var chunk = responseProp.GetString();
                            if (!string.IsNullOrEmpty(chunk))
                            {
                                await onChunk(chunk);
                            }
                        }

                        if (doc.RootElement.TryGetProperty("done", out var doneProp) && doneProp.GetBoolean())
                        {
                            break;
                        }
                    }
                    catch (JsonException ex)
                    {
                        _logger.LogWarning(ex, "Failed to parse Ollama response: {Line}", line);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ollama streaming error");
        }
    }

    public async Task<string?> GenerateChatCompletionAsync(List<ChatMessage> messages, LlmCompletionOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var ollamaUrl = config["Ollama:BaseUrl"] ?? config["OLLAMA_URL"] ?? "http://localhost:11434";
        var model = options?.Model ?? config["Ollama:Model"] ?? config["OLLAMA_MODEL"] ?? "llama3.2:3b";

        var request = new
        {
            model,
            messages = messages.Select(m => new { role = m.Role, content = m.Content }).ToArray(),
            stream = false,
            options = new
            {
                temperature = options?.Temperature ?? 0.7,
                top_p = options?.TopP,
                top_k = options?.TopK,
                stop = options?.StopSequences
            }
        };

        try
        {
            using var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync($"{ollamaUrl}/api/chat", content, ct);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("Ollama chat completion failed: {Status} {Body}", response.StatusCode, errorBody);
                return null;
            }

            var responseBody = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(responseBody);
            
            return doc.RootElement
                .GetProperty("message")
                .GetProperty("content")
                .GetString();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ollama chat completion error");
            return null;
        }
    }

    public async Task StreamChatCompletionAsync(List<ChatMessage> messages, Func<string, Task> onChunk, LlmCompletionOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var ollamaUrl = config["Ollama:BaseUrl"] ?? config["OLLAMA_URL"] ?? "http://localhost:11434";
        var model = options?.Model ?? config["Ollama:Model"] ?? config["OLLAMA_MODEL"] ?? "llama3.2:3b";

        var request = new
        {
            model,
            messages = messages.Select(m => new { role = m.Role, content = m.Content }).ToArray(),
            stream = true,
            options = new
            {
                temperature = options?.Temperature ?? 0.7,
                top_p = options?.TopP,
                top_k = options?.TopK,
                stop = options?.StopSequences
            }
        };

        try
        {
            using var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync($"{ollamaUrl}/api/chat", content, ct);
            
            response.EnsureSuccessStatusCode();

            using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            string? line;
            while ((line = await reader.ReadLineAsync()) != null && !ct.IsCancellationRequested)
            {
                if (!string.IsNullOrWhiteSpace(line))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(line);
                        if (doc.RootElement.TryGetProperty("message", out var messageProp) &&
                            messageProp.TryGetProperty("content", out var contentProp))
                        {
                            var chunk = contentProp.GetString();
                            if (!string.IsNullOrEmpty(chunk))
                            {
                                await onChunk(chunk);
                            }
                        }

                        if (doc.RootElement.TryGetProperty("done", out var doneProp) && doneProp.GetBoolean())
                        {
                            break;
                        }
                    }
                    catch (JsonException ex)
                    {
                        _logger.LogWarning(ex, "Failed to parse Ollama chat response: {Line}", line);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ollama streaming chat error");
        }
    }
}
