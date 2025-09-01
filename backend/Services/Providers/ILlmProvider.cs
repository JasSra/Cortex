using CortexApi.Models;

namespace CortexApi.Services.Providers;

/// <summary>
/// Base interface for Large Language Model providers
/// </summary>
public interface ILlmProvider
{
    /// <summary>
    /// Provider name (e.g., "openai", "ollama")
    /// </summary>
    string Name { get; }
    
    /// <summary>
    /// Available models for this provider
    /// </summary>
    Task<List<string>> GetAvailableModelsAsync();
    
    /// <summary>
    /// Validate provider configuration
    /// </summary>
    Task<ProviderValidationResult> ValidateConfigurationAsync();
    
    /// <summary>
    /// Generate text completion
    /// </summary>
    Task<string?> GenerateCompletionAsync(string prompt, LlmCompletionOptions? options = null, CancellationToken ct = default);
    
    /// <summary>
    /// Stream text completion
    /// </summary>
    Task StreamCompletionAsync(string prompt, Func<string, Task> onChunk, LlmCompletionOptions? options = null, CancellationToken ct = default);
    
    /// <summary>
    /// Generate chat completion
    /// </summary>
    Task<string?> GenerateChatCompletionAsync(List<ChatMessage> messages, LlmCompletionOptions? options = null, CancellationToken ct = default);
    
    /// <summary>
    /// Stream chat completion
    /// </summary>
    Task StreamChatCompletionAsync(List<ChatMessage> messages, Func<string, Task> onChunk, LlmCompletionOptions? options = null, CancellationToken ct = default);
}

/// <summary>
/// Options for LLM completion requests
/// </summary>
public class LlmCompletionOptions
{
    public string? Model { get; set; }
    public double? Temperature { get; set; } = 0.7;
    public int? MaxTokens { get; set; }
    public double? TopP { get; set; }
    public int? TopK { get; set; }
    public List<string>? StopSequences { get; set; }
    public bool Stream { get; set; } = false;
}

/// <summary>
/// Chat message for conversation context
/// </summary>
public class ChatMessage
{
    public string Role { get; set; } = "user"; // "system", "user", "assistant"
    public string Content { get; set; } = string.Empty;
}

/// <summary>
/// Provider validation result
/// </summary>
public class ProviderValidationResult
{
    public bool IsValid { get; set; }
    public List<string> Errors { get; set; } = new();
    public List<string> Warnings { get; set; } = new();
    public Dictionary<string, object> Metadata { get; set; } = new();
}
