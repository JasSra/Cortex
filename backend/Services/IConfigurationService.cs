using CortexApi.Models;

namespace CortexApi.Services;

public interface IConfigurationService
{
    /// <summary>
    /// Bootstrap initial configuration from appsettings.json to database (one-time only)
    /// </summary>
    Task BootstrapConfigurationAsync();
    
    /// <summary>
    /// Get all configuration sections with their settings
    /// </summary>
    Task<List<ConfigurationSectionDto>> GetAllConfigurationAsync();
    
    /// <summary>
    /// Get configuration settings for a specific section
    /// </summary>
    Task<ConfigurationSectionDto?> GetConfigurationSectionAsync(string section);
    
    /// <summary>
    /// Update multiple configuration settings
    /// </summary>
    Task UpdateConfigurationAsync(UpdateConfigurationRequest request);
    
    /// <summary>
    /// Validate configuration settings without saving
    /// </summary>
    Task<ConfigurationValidationResult> ValidateConfigurationAsync(ValidateConfigurationRequest request);
    
    /// <summary>
    /// Get a specific configuration value by key
    /// </summary>
    Task<string?> GetConfigurationValueAsync(string key);
    
    /// <summary>
    /// Set a specific configuration value by key
    /// </summary>
    Task SetConfigurationValueAsync(string key, string value);
    
    /// <summary>
    /// Add a new custom configuration key-value pair
    /// </summary>
    Task AddCustomConfigurationAsync(string key, string value, string section = "Custom", string? description = null);
    
    /// <summary>
    /// Remove a configuration key
    /// </summary>
    Task RemoveConfigurationAsync(string key);
    
    /// <summary>
    /// Get configuration as a .NET Configuration object for use by services
    /// </summary>
    IConfiguration GetConfiguration();
    
    /// <summary>
    /// Reload configuration from database (call after updates)
    /// </summary>
    Task ReloadConfigurationAsync();
}
