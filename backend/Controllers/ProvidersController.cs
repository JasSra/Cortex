using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CortexApi.Services;
using CortexApi.Services.Providers;
using CortexApi.Models;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProvidersController : ControllerBase
{
    private readonly ILlmProviderFactory _llmProviderFactory;
    private readonly IEmbeddingProviderFactory _embeddingProviderFactory;
    private readonly IConfigurationService _configurationService;
    private readonly ILogger<ProvidersController> _logger;

    public ProvidersController(
        ILlmProviderFactory llmProviderFactory,
        IEmbeddingProviderFactory embeddingProviderFactory,
        IConfigurationService configurationService,
        ILogger<ProvidersController> logger)
    {
        _llmProviderFactory = llmProviderFactory;
        _embeddingProviderFactory = embeddingProviderFactory;
        _configurationService = configurationService;
        _logger = logger;
    }

    /// <summary>
    /// Get available LLM providers
    /// </summary>
    [HttpGet("llm")]
    public async Task<ActionResult<List<string>>> GetAvailableLlmProviders()
    {
        try
        {
            var providers = await _llmProviderFactory.GetAvailableProvidersAsync();
            return Ok(providers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting available LLM providers");
            return StatusCode(500, "Error retrieving LLM providers");
        }
    }

    /// <summary>
    /// Get available embedding providers
    /// </summary>
    [HttpGet("embedding")]
    public async Task<ActionResult<List<string>>> GetAvailableEmbeddingProviders()
    {
        try
        {
            var providers = await _embeddingProviderFactory.GetAvailableProvidersAsync();
            return Ok(providers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting available embedding providers");
            return StatusCode(500, "Error retrieving embedding providers");
        }
    }

    /// <summary>
    /// Validate specific LLM provider configuration
    /// </summary>
    [HttpPost("llm/{providerName}/validate")]
    public async Task<ActionResult<ProviderValidationResult>> ValidateLlmProvider(string providerName)
    {
        try
        {
            var result = await _llmProviderFactory.ValidateProviderAsync(providerName);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating LLM provider {Provider}", providerName);
            return BadRequest($"Error validating provider: {ex.Message}");
        }
    }

    /// <summary>
    /// Validate specific embedding provider configuration
    /// </summary>
    [HttpPost("embedding/{providerName}/validate")]
    public async Task<ActionResult<ProviderValidationResult>> ValidateEmbeddingProvider(string providerName)
    {
        try
        {
            var result = await _embeddingProviderFactory.ValidateProviderAsync(providerName);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating embedding provider {Provider}", providerName);
            return BadRequest($"Error validating provider: {ex.Message}");
        }
    }

    /// <summary>
    /// Get available models for a specific LLM provider
    /// </summary>
    [HttpGet("llm/{providerName}/models")]
    public async Task<ActionResult<List<string>>> GetLlmModels(string providerName)
    {
        try
        {
            var provider = _llmProviderFactory.CreateProvider(providerName);
            var models = await provider.GetAvailableModelsAsync();
            return Ok(models);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting models for LLM provider {Provider}", providerName);
            return BadRequest($"Error getting models: {ex.Message}");
        }
    }

    /// <summary>
    /// Get available models for a specific embedding provider
    /// </summary>
    [HttpGet("embedding/{providerName}/models")]
    public async Task<ActionResult<List<string>>> GetEmbeddingModels(string providerName)
    {
        try
        {
            var provider = _embeddingProviderFactory.CreateProvider(providerName);
            var models = await provider.GetAvailableModelsAsync();
            return Ok(models);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting models for embedding provider {Provider}", providerName);
            return BadRequest($"Error getting models: {ex.Message}");
        }
    }

    /// <summary>
    /// Get current provider configuration
    /// </summary>
    [HttpGet("config")]
    public ActionResult<object> GetProviderConfiguration()
    {
        try
        {
            var config = _configurationService.GetConfiguration();
            
            var providerConfig = new
            {
                LlmProvider = config["LLM:Provider"] ?? "openai",
                LlmModel = config["LLM:Model"] ?? "gpt-4o-mini",
                EmbeddingProvider = config["Embedding:Provider"] ?? "openai",
                EmbeddingModel = config["Embedding:Model"] ?? "text-embedding-3-small",
                EmbeddingDimension = config["Embedding:Dim"] ?? "1536"
            };
            
            return Ok(providerConfig);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting provider configuration");
            return StatusCode(500, "Error retrieving provider configuration");
        }
    }

    /// <summary>
    /// Update provider configuration
    /// </summary>
    [HttpPost("config")]
    public async Task<ActionResult> UpdateProviderConfiguration([FromBody] UpdateProviderConfigRequest request)
    {
        try
        {
            var updates = new Dictionary<string, string>();
            
            if (!string.IsNullOrEmpty(request.LlmProvider))
            {
                // Validate provider exists
                try
                {
                    _llmProviderFactory.CreateProvider(request.LlmProvider);
                    updates["LLM:Provider"] = request.LlmProvider;
                }
                catch (ArgumentException)
                {
                    return BadRequest($"Unknown LLM provider: {request.LlmProvider}");
                }
            }

            if (!string.IsNullOrEmpty(request.LlmModel))
                updates["LLM:Model"] = request.LlmModel;

            if (!string.IsNullOrEmpty(request.EmbeddingProvider))
            {
                // Validate provider exists
                try
                {
                    _embeddingProviderFactory.CreateProvider(request.EmbeddingProvider);
                    updates["Embedding:Provider"] = request.EmbeddingProvider;
                }
                catch (ArgumentException)
                {
                    return BadRequest($"Unknown embedding provider: {request.EmbeddingProvider}");
                }
            }

            if (!string.IsNullOrEmpty(request.EmbeddingModel))
                updates["Embedding:Model"] = request.EmbeddingModel;

            if (!string.IsNullOrEmpty(request.EmbeddingDimension))
            {
                if (int.TryParse(request.EmbeddingDimension, out var dim) && dim > 0)
                    updates["Embedding:Dim"] = request.EmbeddingDimension;
                else
                    return BadRequest("EmbeddingDimension must be a positive integer");
            }

            // Apply updates
            foreach (var update in updates)
            {
                await _configurationService.SetConfigurationValueAsync(update.Key, update.Value);
            }

            _logger.LogInformation("Updated provider configuration: {Updates}", string.Join(", ", updates.Keys));
            return Ok(new { message = "Provider configuration updated successfully", updates = updates.Keys });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating provider configuration");
            return StatusCode(500, "Error updating provider configuration");
        }
    }
}

/// <summary>
/// Request model for updating provider configuration
/// </summary>
public class UpdateProviderConfigRequest
{
    public string? LlmProvider { get; set; }
    public string? LlmModel { get; set; }
    public string? EmbeddingProvider { get; set; }
    public string? EmbeddingModel { get; set; }
    public string? EmbeddingDimension { get; set; }
}
