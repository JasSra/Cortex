using System.Text;
using System.Text.Json;
using CortexApi.Models;

namespace CortexApi.Services.Providers;

/// <summary>
/// OpenAI implementation of ILlmProvider
/// </summary>
public class OpenAiLlmProvider : ILlmProvider
{
    private readonly HttpClient _httpClient;
    private readonly IConfigurationService _configurationService;
    private readonly ILogger<OpenAiLlmProvider> _logger;

    public string Name => "openai";

    public OpenAiLlmProvider(HttpClient httpClient, IConfigurationService configurationService, ILogger<OpenAiLlmProvider> logger)
    {
        _httpClient = httpClient;
        _configurationService = configurationService;
        _logger = logger;
    }

    public async Task<List<string>> GetAvailableModelsAsync()
    {
        // Return known OpenAI models
        return new List<string>
        {
            "gpt-4o",
            "gpt-4o-mini", 
            "gpt-4-turbo",
            "gpt-4",
            "gpt-3.5-turbo"
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
            // Test API key with a minimal request
            _httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            
            var testRequest = new
            {
                model = "gpt-3.5-turbo",
                messages = new[] { new { role = "user", content = "test" } },
                max_tokens = 1
            };

            using var content = new StringContent(JsonSerializer.Serialize(testRequest), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync("https://api.openai.com/v1/chat/completions", content);
            
            if (response.IsSuccessStatusCode)
            {
                result.IsValid = true;
                result.Metadata["status"] = "API key validated successfully";
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

    public async Task<string?> GenerateCompletionAsync(string prompt, LlmCompletionOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var apiKey = config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey)) return null;

        var model = options?.Model ?? config["OpenAI:Model"] ?? "gpt-4o-mini";

        var request = new
        {
            model,
            messages = new[] { new { role = "user", content = prompt } },
            temperature = options?.Temperature ?? 0.7,
            max_tokens = options?.MaxTokens,
            top_p = options?.TopP,
            stop = options?.StopSequences
        };

        try
        {
            _httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

            using var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync("https://api.openai.com/v1/chat/completions", content, ct);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("OpenAI completion failed: {Status} {Body}", response.StatusCode, errorBody);
                return null;
            }

            var responseBody = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(responseBody);
            
            return doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OpenAI completion error");
            return null;
        }
    }

    public async Task StreamCompletionAsync(string prompt, Func<string, Task> onChunk, LlmCompletionOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var apiKey = config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey)) return;

        var model = options?.Model ?? config["OpenAI:Model"] ?? "gpt-4o-mini";

        var request = new
        {
            model,
            messages = new[] { new { role = "user", content = prompt } },
            temperature = options?.Temperature ?? 0.7,
            max_tokens = options?.MaxTokens,
            top_p = options?.TopP,
            stop = options?.StopSequences,
            stream = true
        };

        try
        {
            _httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

            using var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync("https://api.openai.com/v1/chat/completions", content, ct);
            
            response.EnsureSuccessStatusCode();

            using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            string? line;
            while ((line = await reader.ReadLineAsync()) != null && !ct.IsCancellationRequested)
            {
                if (line.StartsWith("data: "))
                {
                    var data = line.Substring(6);
                    if (data == "[DONE]") break;

                    try
                    {
                        using var doc = JsonDocument.Parse(data);
                        var choices = doc.RootElement.GetProperty("choices");
                        if (choices.GetArrayLength() > 0)
                        {
                            var delta = choices[0].GetProperty("delta");
                            if (delta.TryGetProperty("content", out var contentProp))
                            {
                                var chunk = contentProp.GetString();
                                if (!string.IsNullOrEmpty(chunk))
                                {
                                    await onChunk(chunk);
                                }
                            }
                        }
                    }
                    catch (JsonException ex)
                    {
                        _logger.LogWarning(ex, "Failed to parse streaming response: {Data}", data);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OpenAI streaming error");
        }
    }

    public async Task<string?> GenerateChatCompletionAsync(List<ChatMessage> messages, LlmCompletionOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var apiKey = config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey)) return null;

        var model = options?.Model ?? config["OpenAI:Model"] ?? "gpt-4o-mini";

        var request = new
        {
            model,
            messages = messages.Select(m => new { role = m.Role, content = m.Content }).ToArray(),
            temperature = options?.Temperature ?? 0.7,
            max_tokens = options?.MaxTokens,
            top_p = options?.TopP,
            stop = options?.StopSequences
        };

        try
        {
            _httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

            using var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync("https://api.openai.com/v1/chat/completions", content, ct);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("OpenAI chat completion failed: {Status} {Body}", response.StatusCode, errorBody);
                return null;
            }

            var responseBody = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(responseBody);
            
            return doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OpenAI chat completion error");
            return null;
        }
    }

    public async Task StreamChatCompletionAsync(List<ChatMessage> messages, Func<string, Task> onChunk, LlmCompletionOptions? options = null, CancellationToken ct = default)
    {
        var config = _configurationService.GetConfiguration();
        var apiKey = config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey)) return;

        var model = options?.Model ?? config["OpenAI:Model"] ?? "gpt-4o-mini";

        var request = new
        {
            model,
            messages = messages.Select(m => new { role = m.Role, content = m.Content }).ToArray(),
            temperature = options?.Temperature ?? 0.7,
            max_tokens = options?.MaxTokens,
            top_p = options?.TopP,
            stop = options?.StopSequences,
            stream = true
        };

        try
        {
            _httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

            using var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync("https://api.openai.com/v1/chat/completions", content, ct);
            
            response.EnsureSuccessStatusCode();

            using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            string? line;
            while ((line = await reader.ReadLineAsync()) != null && !ct.IsCancellationRequested)
            {
                if (line.StartsWith("data: "))
                {
                    var data = line.Substring(6);
                    if (data == "[DONE]") break;

                    try
                    {
                        using var doc = JsonDocument.Parse(data);
                        var choices = doc.RootElement.GetProperty("choices");
                        if (choices.GetArrayLength() > 0)
                        {
                            var delta = choices[0].GetProperty("delta");
                            if (delta.TryGetProperty("content", out var contentProp))
                            {
                                var chunk = contentProp.GetString();
                                if (!string.IsNullOrEmpty(chunk))
                                {
                                    await onChunk(chunk);
                                }
                            }
                        }
                    }
                    catch (JsonException ex)
                    {
                        _logger.LogWarning(ex, "Failed to parse streaming response: {Data}", data);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OpenAI streaming chat error");
        }
    }
}
