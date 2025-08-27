using System.Text;
using System.Text.Json;

namespace CortexApi.Services;

public interface IChatService
{
    Task StreamChatResponseAsync(string prompt, string provider, HttpContext context);
}

public class ChatService : IChatService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ChatService> _logger;

    public ChatService(HttpClient httpClient, IConfiguration configuration, ILogger<ChatService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task StreamChatResponseAsync(string prompt, string provider, HttpContext context)
    {
        context.Response.Headers.Add("Content-Type", "text/event-stream");
        context.Response.Headers.Add("Cache-Control", "no-cache");
        context.Response.Headers.Add("Connection", "keep-alive");

        try
        {
            if (provider.ToLower() == "ollama")
            {
                await StreamOllamaResponseAsync(prompt, context);
            }
            else if (provider.ToLower() == "openai")
            {
                await StreamOpenAiResponseAsync(prompt, context);
            }
            else
            {
                await SendSseEventAsync(context, "error", "Unsupported provider");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error streaming chat response");
            await SendSseEventAsync(context, "error", ex.Message);
        }
    }

    private async Task StreamOllamaResponseAsync(string prompt, HttpContext context)
    {
        var ollamaUrl = _configuration["OLLAMA_URL"] ?? "http://ollama:11434";
        var ollamaModel = _configuration["OLLAMA_MODEL"] ?? "llama3.2:3b";

        var requestData = new
        {
            model = ollamaModel,
            prompt = prompt,
            stream = true
        };

        var json = JsonSerializer.Serialize(requestData);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        using var response = await _httpClient.PostAsync($"{ollamaUrl}/api/generate", content);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);

        string? line;
        while ((line = await reader.ReadLineAsync()) != null)
        {
            if (!string.IsNullOrWhiteSpace(line))
            {
                try
                {
                    var jsonResponse = JsonSerializer.Deserialize<JsonElement>(line);
                    if (jsonResponse.TryGetProperty("response", out var responseText))
                    {
                        await SendSseEventAsync(context, "data", responseText.GetString() ?? "");
                    }

                    if (jsonResponse.TryGetProperty("done", out var done) && done.GetBoolean())
                    {
                        await SendSseEventAsync(context, "done", "");
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

    private async Task StreamOpenAiResponseAsync(string prompt, HttpContext context)
    {
        var apiKey = _configuration["OPENAI_API_KEY"];
        if (string.IsNullOrEmpty(apiKey))
        {
            await SendSseEventAsync(context, "error", "OpenAI API key not configured");
            return;
        }

        var model = _configuration["OPENAI_MODEL"] ?? "gpt-4o-mini";

        var requestData = new
        {
            model = model,
            messages = new[]
            {
                new { role = "user", content = prompt }
            },
            stream = true
        };

        var json = JsonSerializer.Serialize(requestData);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        _httpClient.DefaultRequestHeaders.Authorization = 
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

        using var response = await _httpClient.PostAsync("https://api.openai.com/v1/chat/completions", content);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);

        string? line;
        while ((line = await reader.ReadLineAsync()) != null)
        {
            if (line.StartsWith("data: "))
            {
                var data = line.Substring(6);
                if (data == "[DONE]")
                {
                    await SendSseEventAsync(context, "done", "");
                    break;
                }

                try
                {
                    var jsonResponse = JsonSerializer.Deserialize<JsonElement>(data);
                    if (jsonResponse.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                    {
                        var choice = choices[0];
                        if (choice.TryGetProperty("delta", out var delta) && 
                            delta.TryGetProperty("content", out var content_text))
                        {
                            await SendSseEventAsync(context, "data", content_text.GetString() ?? "");
                        }
                    }
                }
                catch (JsonException ex)
                {
                    _logger.LogWarning(ex, "Failed to parse OpenAI response: {Line}", data);
                }
            }
        }
    }

    private async Task SendSseEventAsync(HttpContext context, string eventType, string data)
    {
        var message = $"event: {eventType}\ndata: {data}\n\n";
        var bytes = Encoding.UTF8.GetBytes(message);
        await context.Response.Body.WriteAsync(bytes);
        await context.Response.Body.FlushAsync();
    }
}
