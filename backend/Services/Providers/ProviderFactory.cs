using CortexApi.Services.Providers;

namespace CortexApi.Services;

/// <summary>
/// Factory for creating LLM providers based on configuration
/// </summary>
public interface ILlmProviderFactory
{
    ILlmProvider CreateProvider(string providerName);
    Task<List<string>> GetAvailableProvidersAsync();
    Task<ProviderValidationResult> ValidateProviderAsync(string providerName);
}

/// <summary>
/// Factory implementation for LLM providers
/// </summary>
public class LlmProviderFactory : ILlmProviderFactory
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<LlmProviderFactory> _logger;

    public LlmProviderFactory(IServiceProvider serviceProvider, ILogger<LlmProviderFactory> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public ILlmProvider CreateProvider(string providerName)
    {
        return providerName.ToLowerInvariant() switch
        {
            "openai" => _serviceProvider.GetRequiredService<OpenAiLlmProvider>(),
            "ollama" => _serviceProvider.GetRequiredService<OllamaLlmProvider>(),
            _ => throw new ArgumentException($"Unknown LLM provider: {providerName}", nameof(providerName))
        };
    }

    public async Task<List<string>> GetAvailableProvidersAsync()
    {
        var providers = new List<string>();
        
        // Check OpenAI
        try
        {
            var openAiProvider = _serviceProvider.GetRequiredService<OpenAiLlmProvider>();
            var result = await openAiProvider.ValidateConfigurationAsync();
            if (result.IsValid)
                providers.Add("openai");
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "OpenAI provider not available");
        }

        // Check Ollama
        try
        {
            var ollamaProvider = _serviceProvider.GetRequiredService<OllamaLlmProvider>();
            var result = await ollamaProvider.ValidateConfigurationAsync();
            if (result.IsValid)
                providers.Add("ollama");
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Ollama provider not available");
        }

        return providers;
    }

    public async Task<ProviderValidationResult> ValidateProviderAsync(string providerName)
    {
        try
        {
            var provider = CreateProvider(providerName);
            return await provider.ValidateConfigurationAsync();
        }
        catch (Exception ex)
        {
            return new ProviderValidationResult
            {
                IsValid = false,
                Errors = { $"Provider validation failed: {ex.Message}" }
            };
        }
    }
}

/// <summary>
/// Factory for creating embedding providers based on configuration
/// </summary>
public interface IEmbeddingProviderFactory
{
    IEmbeddingProvider CreateProvider(string providerName);
    Task<List<string>> GetAvailableProvidersAsync();
    Task<ProviderValidationResult> ValidateProviderAsync(string providerName);
}

/// <summary>
/// Factory implementation for embedding providers
/// </summary>
public class EmbeddingProviderFactory : IEmbeddingProviderFactory
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<EmbeddingProviderFactory> _logger;

    public EmbeddingProviderFactory(IServiceProvider serviceProvider, ILogger<EmbeddingProviderFactory> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public IEmbeddingProvider CreateProvider(string providerName)
    {
        return providerName.ToLowerInvariant() switch
        {
            "openai" => _serviceProvider.GetRequiredService<OpenAiEmbeddingProvider>(),
            "local" => _serviceProvider.GetRequiredService<LocalEmbeddingProvider>(),
            _ => throw new ArgumentException($"Unknown embedding provider: {providerName}", nameof(providerName))
        };
    }

    public async Task<List<string>> GetAvailableProvidersAsync()
    {
        var providers = new List<string>();
        
        // Check OpenAI
        try
        {
            var openAiProvider = _serviceProvider.GetRequiredService<OpenAiEmbeddingProvider>();
            var result = await openAiProvider.ValidateConfigurationAsync();
            if (result.IsValid)
                providers.Add("openai");
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "OpenAI embedding provider not available");
        }

        // Check Local
        try
        {
            var localProvider = _serviceProvider.GetRequiredService<LocalEmbeddingProvider>();
            var result = await localProvider.ValidateConfigurationAsync();
            if (result.IsValid)
                providers.Add("local");
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Local embedding provider not available");
        }

        return providers;
    }

    public async Task<ProviderValidationResult> ValidateProviderAsync(string providerName)
    {
        try
        {
            var provider = CreateProvider(providerName);
            return await provider.ValidateConfigurationAsync();
        }
        catch (Exception ex)
        {
            return new ProviderValidationResult
            {
                IsValid = false,
                Errors = { $"Provider validation failed: {ex.Message}" }
            };
        }
    }
}
