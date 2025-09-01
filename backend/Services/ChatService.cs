using System.Text;
using System.Text.Json;
using CortexApi.Services.Providers;

namespace CortexApi.Services;

public interface IChatService
{
    Task StreamChatResponseAsync(string prompt, string provider, HttpContext context);
}

public class ChatService : IChatService
{
    private readonly ILogger<ChatService> _logger;
    private readonly ILlmProvider _llmProvider;

    public ChatService(ILogger<ChatService> logger, ILlmProvider llmProvider)
    {
        _logger = logger;
        _llmProvider = llmProvider;
    }

    public async Task StreamChatResponseAsync(string prompt, string provider, HttpContext context)
    {
        context.Response.Headers.Append("Content-Type", "text/event-stream");
        context.Response.Headers.Append("Cache-Control", "no-cache");
        context.Response.Headers.Append("Connection", "keep-alive");

        try
        {
            var messages = new List<ChatMessage>
            {
                new ChatMessage { Role = "user", Content = prompt }
            };

            await _llmProvider.StreamChatCompletionAsync(messages, async chunk =>
            {
                await SendSseEventAsync(context, "data", chunk);
            });

            await SendSseEventAsync(context, "end", "");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error streaming chat response");
            await SendSseEventAsync(context, "error", ex.Message);
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
