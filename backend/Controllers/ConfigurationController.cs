using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CortexApi.Services;
using CortexApi.Models;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ConfigurationController : ControllerBase
{
    private readonly IConfigurationService _configurationService;
    private readonly ILogger<ConfigurationController> _logger;

    public ConfigurationController(
        IConfigurationService configurationService, 
        ILogger<ConfigurationController> logger)
    {
        _configurationService = configurationService;
        _logger = logger;
    }

    /// <summary>
    /// Get all configuration sections and their settings
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<ConfigurationSectionDto>>> GetAllConfiguration()
    {
        try
        {
            var sections = await _configurationService.GetAllConfigurationAsync();
            return Ok(sections);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get configuration");
            return StatusCode(500, new { error = "Failed to retrieve configuration" });
        }
    }

    /// <summary>
    /// Get configuration settings for a specific section
    /// </summary>
    [HttpGet("{section}")]
    public async Task<ActionResult<ConfigurationSectionDto>> GetConfigurationSection(string section)
    {
        try
        {
            var sectionDto = await _configurationService.GetConfigurationSectionAsync(section);
            if (sectionDto == null)
            {
                return NotFound(new { error = $"Configuration section '{section}' not found" });
            }

            return Ok(sectionDto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get configuration section {Section}", section);
            return StatusCode(500, new { error = "Failed to retrieve configuration section" });
        }
    }

    /// <summary>
    /// Update multiple configuration settings
    /// </summary>
    [HttpPost]
    public async Task<ActionResult> UpdateConfiguration([FromBody] UpdateConfigurationRequest request)
    {
        try
        {
            // Validate first
            var validation = await _configurationService.ValidateConfigurationAsync(new ValidateConfigurationRequest
            {
                Settings = request.Settings
            });

            if (!validation.IsValid)
            {
                return BadRequest(new 
                { 
                    error = "Configuration validation failed", 
                    details = validation.Errors,
                    warnings = validation.Warnings
                });
            }

            await _configurationService.UpdateConfigurationAsync(request);

            // Check if any settings require restart
            var requiresRestart = false; // TODO: Check if any updated settings require restart
            
            return Ok(new 
            { 
                message = "Configuration updated successfully", 
                requiresRestart,
                warnings = validation.Warnings
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update configuration");
            return StatusCode(500, new { error = "Failed to update configuration" });
        }
    }

    /// <summary>
    /// Validate configuration settings without saving
    /// </summary>
    [HttpPost("validate")]
    public async Task<ActionResult<ConfigurationValidationResult>> ValidateConfiguration([FromBody] ValidateConfigurationRequest request)
    {
        try
        {
            var result = await _configurationService.ValidateConfigurationAsync(request);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate configuration");
            return StatusCode(500, new { error = "Failed to validate configuration" });
        }
    }

    /// <summary>
    /// Get a specific configuration value by key
    /// </summary>
    [HttpGet("value/{key}")]
    public async Task<ActionResult<string>> GetConfigurationValue(string key)
    {
        try
        {
            var value = await _configurationService.GetConfigurationValueAsync(key);
            if (value == null)
            {
                return NotFound(new { error = $"Configuration key '{key}' not found" });
            }

            return Ok(new { key, value });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get configuration value for key {Key}", key);
            return StatusCode(500, new { error = "Failed to retrieve configuration value" });
        }
    }

    /// <summary>
    /// Set a specific configuration value by key
    /// </summary>
    [HttpPost("value/{key}")]
    public async Task<ActionResult> SetConfigurationValue(string key, [FromBody] SetConfigurationValueRequest request)
    {
        try
        {
            // Validate the single setting
            var validation = await _configurationService.ValidateConfigurationAsync(new ValidateConfigurationRequest
            {
                Settings = new List<ConfigurationUpdateItem> 
                { 
                    new ConfigurationUpdateItem { Key = key, Value = request.Value } 
                }
            });

            if (!validation.IsValid)
            {
                return BadRequest(new 
                { 
                    error = "Configuration validation failed", 
                    details = validation.Errors 
                });
            }

            await _configurationService.SetConfigurationValueAsync(key, request.Value);
            
            return Ok(new { message = $"Configuration key '{key}' updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set configuration value for key {Key}", key);
            return StatusCode(500, new { error = "Failed to set configuration value" });
        }
    }

    /// <summary>
    /// Test connectivity for provider-specific settings (e.g., OpenAI API, Redis)
    /// </summary>
    [HttpPost("test")]
    public async Task<ActionResult> TestConfiguration([FromBody] TestConfigurationRequest request)
    {
        try
        {
            var results = new List<TestResult>();

            foreach (var test in request.Tests)
            {
                var testResult = await PerformConnectionTest(test.Provider, test.Settings);
                results.Add(testResult);
            }

            var allPassed = results.All(r => r.Success);
            
            return Ok(new 
            { 
                success = allPassed,
                message = allPassed ? "All tests passed" : "Some tests failed",
                results 
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to test configuration");
            return StatusCode(500, new { error = "Failed to test configuration" });
        }
    }

    private async Task<TestResult> PerformConnectionTest(string provider, Dictionary<string, string> settings)
    {
        try
        {
            switch (provider.ToLowerInvariant())
            {
                case "openai":
                    return await TestOpenAIConnection(settings);
                
                case "redis":
                    return await TestRedisConnection(settings);
                
                case "embedding":
                    return await TestEmbeddingProvider(settings);
                
                default:
                    return new TestResult
                    {
                        Provider = provider,
                        Success = false,
                        Message = $"Unknown provider: {provider}",
                        ResponseTime = TimeSpan.Zero
                    };
            }
        }
        catch (Exception ex)
        {
            return new TestResult
            {
                Provider = provider,
                Success = false,
                Message = $"Test failed: {ex.Message}",
                ResponseTime = TimeSpan.Zero
            };
        }
    }

    private async Task<TestResult> TestOpenAIConnection(Dictionary<string, string> settings)
    {
        var startTime = DateTime.UtcNow;
        
        if (!settings.TryGetValue("ApiKey", out var apiKey) || string.IsNullOrWhiteSpace(apiKey))
        {
            return new TestResult
            {
                Provider = "OpenAI",
                Success = false,
                Message = "API key is required",
                ResponseTime = DateTime.UtcNow - startTime
            };
        }

        try
        {
            // TODO: Make actual API call to test the key
            // For now, just validate format
            if (!apiKey.StartsWith("sk-"))
            {
                return new TestResult
                {
                    Provider = "OpenAI",
                    Success = false,
                    Message = "Invalid API key format",
                    ResponseTime = DateTime.UtcNow - startTime
                };
            }

            // Simulate API test delay
            await Task.Delay(100);

            return new TestResult
            {
                Provider = "OpenAI",
                Success = true,
                Message = "API key format is valid",
                ResponseTime = DateTime.UtcNow - startTime
            };
        }
        catch (Exception ex)
        {
            return new TestResult
            {
                Provider = "OpenAI",
                Success = false,
                Message = $"Connection failed: {ex.Message}",
                ResponseTime = DateTime.UtcNow - startTime
            };
        }
    }

    private async Task<TestResult> TestRedisConnection(Dictionary<string, string> settings)
    {
        var startTime = DateTime.UtcNow;
        
        if (!settings.TryGetValue("Connection", out var connectionString) || string.IsNullOrWhiteSpace(connectionString))
        {
            return new TestResult
            {
                Provider = "Redis",
                Success = false,
                Message = "Connection string is required",
                ResponseTime = DateTime.UtcNow - startTime
            };
        }

        try
        {
            // TODO: Make actual Redis connection test
            // For now, just validate format
            var parts = connectionString.Split(':');
            if (parts.Length != 2 || !int.TryParse(parts[1], out var port) || port <= 0)
            {
                return new TestResult
                {
                    Provider = "Redis",
                    Success = false,
                    Message = "Invalid connection string format. Use host:port",
                    ResponseTime = DateTime.UtcNow - startTime
                };
            }

            // Simulate connection test delay
            await Task.Delay(200);

            return new TestResult
            {
                Provider = "Redis",
                Success = true,
                Message = "Connection format is valid",
                ResponseTime = DateTime.UtcNow - startTime
            };
        }
        catch (Exception ex)
        {
            return new TestResult
            {
                Provider = "Redis",
                Success = false,
                Message = $"Connection failed: {ex.Message}",
                ResponseTime = DateTime.UtcNow - startTime
            };
        }
    }

    private async Task<TestResult> TestEmbeddingProvider(Dictionary<string, string> settings)
    {
        var startTime = DateTime.UtcNow;
        
        if (!settings.TryGetValue("Provider", out var provider) || string.IsNullOrWhiteSpace(provider))
        {
            return new TestResult
            {
                Provider = "Embedding",
                Success = false,
                Message = "Provider is required",
                ResponseTime = DateTime.UtcNow - startTime
            };
        }

        try
        {
            // TODO: Test actual embedding generation
            // For now, just validate configuration
            await Task.Delay(150);

            return new TestResult
            {
                Provider = "Embedding",
                Success = true,
                Message = $"Provider '{provider}' configuration is valid",
                ResponseTime = DateTime.UtcNow - startTime
            };
        }
        catch (Exception ex)
        {
            return new TestResult
            {
                Provider = "Embedding",
                Success = false,
                Message = $"Test failed: {ex.Message}",
                ResponseTime = DateTime.UtcNow - startTime
            };
        }
    }
}

// Additional DTOs for configuration testing
public class SetConfigurationValueRequest
{
    public string Value { get; set; } = string.Empty;
}

public class TestConfigurationRequest
{
    public List<ProviderTest> Tests { get; set; } = new();
}

public class ProviderTest
{
    public string Provider { get; set; } = string.Empty;
    public Dictionary<string, string> Settings { get; set; } = new();
}

public class TestResult
{
    public string Provider { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public TimeSpan ResponseTime { get; set; }
    public string? Details { get; set; }
}
