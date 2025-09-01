namespace CortexApi.Services.Providers;

/// <summary>
/// Base interface for embedding providers
/// </summary>
public interface IEmbeddingProvider
{
    /// <summary>
    /// Provider name (e.g., "openai", "local", "azure")
    /// </summary>
    string Name { get; }
    
    /// <summary>
    /// Embedding dimension for this provider/model
    /// </summary>
    int EmbeddingDimension { get; }
    
    /// <summary>
    /// Available models for this provider
    /// </summary>
    Task<List<string>> GetAvailableModelsAsync();
    
    /// <summary>
    /// Validate provider configuration
    /// </summary>
    Task<ProviderValidationResult> ValidateConfigurationAsync();
    
    /// <summary>
    /// Generate embedding for text
    /// </summary>
    Task<float[]?> GenerateEmbeddingAsync(string text, EmbeddingOptions? options = null, CancellationToken ct = default);
    
    /// <summary>
    /// Generate embeddings for multiple texts (batch)
    /// </summary>
    Task<List<float[]?>> GenerateEmbeddingsAsync(List<string> texts, EmbeddingOptions? options = null, CancellationToken ct = default);
}

/// <summary>
/// Options for embedding requests
/// </summary>
public class EmbeddingOptions
{
    public string? Model { get; set; }
    public int? Dimensions { get; set; }
    public string? EncodingFormat { get; set; } = "float";
}
