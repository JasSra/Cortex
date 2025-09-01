using CortexApi.Data;
using CortexApi.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Text.Json;

namespace CortexApi.Services;

public class ConfigurationService : IConfigurationService
{
    private readonly CortexDbContext _context;
    private readonly IConfiguration _originalConfiguration;
    private readonly ILogger<ConfigurationService> _logger;
    private IConfiguration? _dbConfiguration;
    private readonly object _configLock = new object();

    public ConfigurationService(CortexDbContext context, IConfiguration configuration, ILogger<ConfigurationService> logger)
    {
        _context = context;
        _originalConfiguration = configuration;
        _logger = logger;
    }

    public async Task BootstrapConfigurationAsync()
    {
        try
        {
            // Check if configuration has already been bootstrapped
            var existingCount = await _context.ConfigurationSettings.CountAsync();
            if (existingCount > 0)
            {
                _logger.LogInformation("Configuration already bootstrapped ({Count} settings exist)", existingCount);
                return;
            }

            _logger.LogInformation("Bootstrapping configuration from appsettings...");

            var settings = new List<ConfigurationSetting>();

            // OpenAI Configuration
            var openAiSection = _originalConfiguration.GetSection("OpenAI");
            if (openAiSection.Exists())
            {
                settings.AddRange(new[]
                {
                    new ConfigurationSetting
                    {
                        Key = "OpenAI:ApiKey",
                        Value = openAiSection["ApiKey"] ?? "",
                        ValueType = "string",
                        Section = "OpenAI",
                        Description = "OpenAI API Key for GPT and embedding services",
                        IsSensitive = true,
                        RequiresRestart = false,
                        DefaultValue = "",
                        ValidationRules = JsonSerializer.Serialize(new { required = true, minLength = 10 }),
                        SortOrder = 1
                    },
                    new ConfigurationSetting
                    {
                        Key = "OpenAI:Model",
                        Value = openAiSection["Model"] ?? "gpt-4o-mini",
                        ValueType = "string",
                        Section = "OpenAI",
                        Description = "Default OpenAI model for chat completion",
                        IsSensitive = false,
                        RequiresRestart = false,
                        DefaultValue = "gpt-4o-mini",
                        ValidationRules = JsonSerializer.Serialize(new { options = new[] { "gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo" } }),
                        SortOrder = 2
                    },
                    new ConfigurationSetting
                    {
                        Key = "OpenAI:NerModel",
                        Value = openAiSection["NerModel"] ?? "gpt-4o-mini",
                        ValueType = "string",
                        Section = "OpenAI",
                        Description = "OpenAI model for Named Entity Recognition",
                        IsSensitive = false,
                        RequiresRestart = false,
                        DefaultValue = "gpt-4o-mini",
                        ValidationRules = JsonSerializer.Serialize(new { options = new[] { "gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo" } }),
                        SortOrder = 3
                    },
                    new ConfigurationSetting
                    {
                        Key = "OpenAI:TtsModel",
                        Value = openAiSection["TtsModel"] ?? "tts-1",
                        ValueType = "string",
                        Section = "OpenAI",
                        Description = "OpenAI Text-to-Speech model",
                        IsSensitive = false,
                        RequiresRestart = false,
                        DefaultValue = "tts-1",
                        ValidationRules = JsonSerializer.Serialize(new { options = new[] { "tts-1", "tts-1-hd" } }),
                        SortOrder = 4
                    },
                    new ConfigurationSetting
                    {
                        Key = "OpenAI:TtsVoice",
                        Value = openAiSection["TtsVoice"] ?? "alloy",
                        ValueType = "string",
                        Section = "OpenAI",
                        Description = "OpenAI TTS voice selection",
                        IsSensitive = false,
                        RequiresRestart = false,
                        DefaultValue = "alloy",
                        ValidationRules = JsonSerializer.Serialize(new { options = new[] { "alloy", "echo", "fable", "onyx", "nova", "shimmer" } }),
                        SortOrder = 5
                    },
                    new ConfigurationSetting
                    {
                        Key = "OpenAI:WhisperModel",
                        Value = openAiSection["WhisperModel"] ?? "whisper-1",
                        ValueType = "string",
                        Section = "OpenAI",
                        Description = "OpenAI Whisper model for speech-to-text",
                        IsSensitive = false,
                        RequiresRestart = false,
                        DefaultValue = "whisper-1",
                        ValidationRules = JsonSerializer.Serialize(new { options = new[] { "whisper-1" } }),
                        SortOrder = 6
                    }
                });
            }

            // Embedding Configuration
            var embeddingSection = _originalConfiguration.GetSection("Embedding");
            if (embeddingSection.Exists())
            {
                settings.AddRange(new[]
                {
                    new ConfigurationSetting
                    {
                        Key = "Embedding:Provider",
                        Value = embeddingSection["Provider"] ?? "openai",
                        ValueType = "string",
                        Section = "Embedding",
                        Description = "Embedding provider (openai, local, etc.)",
                        IsSensitive = false,
                        RequiresRestart = true,
                        DefaultValue = "openai",
                        ValidationRules = JsonSerializer.Serialize(new { options = new[] { "openai", "local", "azure" } }),
                        SortOrder = 1
                    },
                    new ConfigurationSetting
                    {
                        Key = "Embedding:Model",
                        Value = embeddingSection["Model"] ?? "text-embedding-3-small",
                        ValueType = "string",
                        Section = "Embedding",
                        Description = "Embedding model name",
                        IsSensitive = false,
                        RequiresRestart = true,
                        DefaultValue = "text-embedding-3-small",
                        ValidationRules = JsonSerializer.Serialize(new { dependsOn = "Embedding:Provider" }),
                        SortOrder = 2
                    },
                    new ConfigurationSetting
                    {
                        Key = "Embedding:Dim",
                        Value = embeddingSection["Dim"] ?? "1536",
                        ValueType = "number",
                        Section = "Embedding",
                        Description = "Embedding dimension size",
                        IsSensitive = false,
                        RequiresRestart = true,
                        DefaultValue = "1536",
                        ValidationRules = JsonSerializer.Serialize(new { type = "number", min = 64, max = 4096 }),
                        SortOrder = 3
                    }
                });
            }

            // Redis Configuration
            var redisSection = _originalConfiguration.GetSection("Redis");
            if (redisSection.Exists())
            {
                settings.Add(new ConfigurationSetting
                {
                    Key = "Redis:Connection",
                    Value = redisSection["Connection"] ?? "localhost:6379",
                    ValueType = "string",
                    Section = "Redis",
                    Description = "Redis connection string for caching and vector operations",
                    IsSensitive = false,
                    RequiresRestart = true,
                    DefaultValue = "localhost:6379",
                    ValidationRules = JsonSerializer.Serialize(new { pattern = @"^[^:]+:\d+$" }),
                    SortOrder = 1
                });
            }

            // Voice Configuration
            var voiceSection = _originalConfiguration.GetSection("Voice");
            if (voiceSection.Exists())
            {
                settings.AddRange(new[]
                {
                    new ConfigurationSetting
                    {
                        Key = "Voice:TtsProvider",
                        Value = voiceSection["TtsProvider"] ?? "openai",
                        ValueType = "string",
                        Section = "Voice",
                        Description = "Text-to-Speech provider",
                        IsSensitive = false,
                        RequiresRestart = false,
                        DefaultValue = "openai",
                        ValidationRules = JsonSerializer.Serialize(new { options = new[] { "openai", "piper", "local" } }),
                        SortOrder = 1
                    },
                    new ConfigurationSetting
                    {
                        Key = "Voice:SttProvider",
                        Value = voiceSection["SttProvider"] ?? "openai",
                        ValueType = "string",
                        Section = "Voice",
                        Description = "Speech-to-Text provider",
                        IsSensitive = false,
                        RequiresRestart = false,
                        DefaultValue = "openai",
                        ValidationRules = JsonSerializer.Serialize(new { options = new[] { "openai", "whisper", "local" } }),
                        SortOrder = 2
                    }
                });
            }

            // Server Configuration
            var serverSection = _originalConfiguration.GetSection("Server");
            if (serverSection.Exists())
            {
                settings.AddRange(new[]
                {
                    new ConfigurationSetting
                    {
                        Key = "Server:Port",
                        Value = serverSection["Port"] ?? "8081",
                        ValueType = "number",
                        Section = "Server",
                        Description = "Server port number",
                        IsSensitive = false,
                        RequiresRestart = true,
                        DefaultValue = "8081",
                        ValidationRules = JsonSerializer.Serialize(new { type = "number", min = 1024, max = 65535 }),
                        SortOrder = 1
                    }
                });

                var corsOrigins = serverSection.GetSection("CorsOrigins").Get<string[]>();
                if (corsOrigins != null && corsOrigins.Length > 0)
                {
                    settings.Add(new ConfigurationSetting
                    {
                        Key = "Server:CorsOrigins",
                        Value = JsonSerializer.Serialize(corsOrigins),
                        ValueType = "json",
                        Section = "Server",
                        Description = "Allowed CORS origins (JSON array)",
                        IsSensitive = false,
                        RequiresRestart = true,
                        DefaultValue = JsonSerializer.Serialize(new[] { "http://localhost:3000", "http://localhost:3001" }),
                        ValidationRules = JsonSerializer.Serialize(new { type = "array", items = new { type = "string", pattern = @"^https?://[^/]+$" } }),
                        SortOrder = 2
                    });
                }
            }

            // Worker Configuration
            settings.AddRange(new[]
            {
                new ConfigurationSetting
                {
                    Key = "Worker:EnableEmbeddingWorker",
                    Value = "true",
                    ValueType = "boolean",
                    Section = "Worker",
                    Description = "Enable the local embedding background worker",
                    IsSensitive = false,
                    RequiresRestart = true,
                    DefaultValue = "true",
                    ValidationRules = JsonSerializer.Serialize(new { type = "boolean" }),
                    SortOrder = 1
                },
                new ConfigurationSetting
                {
                    Key = "Worker:EnableGraphWorker",
                    Value = "true",
                    ValueType = "boolean",
                    Section = "Worker",
                    Description = "Enable the knowledge graph background worker",
                    IsSensitive = false,
                    RequiresRestart = true,
                    DefaultValue = "true",
                    ValidationRules = JsonSerializer.Serialize(new { type = "boolean" }),
                    SortOrder = 2
                },
                new ConfigurationSetting
                {
                    Key = "Worker:EnableClassificationWorker",
                    Value = "true",
                    ValueType = "boolean",
                    Section = "Worker",
                    Description = "Enable the content classification background worker",
                    IsSensitive = false,
                    RequiresRestart = true,
                    DefaultValue = "true",
                    ValidationRules = JsonSerializer.Serialize(new { type = "boolean" }),
                    SortOrder = 3
                }
            });

            // Save all settings
            _context.ConfigurationSettings.AddRange(settings);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Configuration bootstrapped successfully with {Count} settings", settings.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to bootstrap configuration");
            throw;
        }
    }

    public async Task<List<ConfigurationSectionDto>> GetAllConfigurationAsync()
    {
        var settings = await _context.ConfigurationSettings
            .OrderBy(s => s.Section)
            .ThenBy(s => s.SortOrder)
            .ToListAsync();

        var sections = settings
            .GroupBy(s => s.Section)
            .Select(g => new ConfigurationSectionDto
            {
                Name = g.Key,
                DisplayName = GetSectionDisplayName(g.Key),
                Description = GetSectionDescription(g.Key),
                Settings = g.Select(MapToDto).ToList()
            })
            .ToList();

        return sections;
    }

    public async Task<ConfigurationSectionDto?> GetConfigurationSectionAsync(string section)
    {
        var settings = await _context.ConfigurationSettings
            .Where(s => s.Section == section)
            .OrderBy(s => s.SortOrder)
            .ToListAsync();

        if (!settings.Any())
            return null;

        return new ConfigurationSectionDto
        {
            Name = section,
            DisplayName = GetSectionDisplayName(section),
            Description = GetSectionDescription(section),
            Settings = settings.Select(MapToDto).ToList()
        };
    }

    public async Task UpdateConfigurationAsync(UpdateConfigurationRequest request)
    {
        var settingsToUpdate = await _context.ConfigurationSettings
            .Where(s => request.Settings.Select(u => u.Key).Contains(s.Key))
            .ToListAsync();

        foreach (var update in request.Settings)
        {
            var setting = settingsToUpdate.FirstOrDefault(s => s.Key == update.Key);
            if (setting != null)
            {
                setting.Value = update.Value;
                setting.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _context.SaveChangesAsync();
        
        // Reload configuration in memory
        await ReloadConfigurationAsync();
    }

    public async Task<ConfigurationValidationResult> ValidateConfigurationAsync(ValidateConfigurationRequest request)
    {
        var result = new ConfigurationValidationResult { IsValid = true };

        foreach (var setting in request.Settings)
        {
            var configSetting = await _context.ConfigurationSettings
                .FirstOrDefaultAsync(s => s.Key == setting.Key);

            if (configSetting == null)
            {
                result.Errors.Add(new ValidationError
                {
                    Key = setting.Key,
                    Message = "Configuration setting not found",
                    Code = "NOT_FOUND"
                });
                result.IsValid = false;
                continue;
            }

            // Validate based on setting type and rules
            var validationError = ValidateSetting(configSetting, setting.Value);
            if (validationError != null)
            {
                result.Errors.Add(validationError);
                result.IsValid = false;
            }

            // Provider-specific validation
            var providerValidation = await ValidateProviderSpecificAsync(setting.Key, setting.Value);
            if (providerValidation.HasValue)
            {
                if (providerValidation.Value.IsError)
                {
                    result.Errors.Add(new ValidationError
                    {
                        Key = setting.Key,
                        Message = providerValidation.Value.Message,
                        Code = providerValidation.Value.Code
                    });
                    result.IsValid = false;
                }
                else
                {
                    result.Warnings.Add(new ValidationWarning
                    {
                        Key = setting.Key,
                        Message = providerValidation.Value.Message,
                        Code = providerValidation.Value.Code
                    });
                }
            }
        }

        result.Message = result.IsValid ? "Configuration is valid" : $"Found {result.Errors.Count} errors";
        return result;
    }

    public async Task<string?> GetConfigurationValueAsync(string key)
    {
        var setting = await _context.ConfigurationSettings
            .FirstOrDefaultAsync(s => s.Key == key);
        return setting?.Value;
    }

    public async Task SetConfigurationValueAsync(string key, string value)
    {
        var setting = await _context.ConfigurationSettings
            .FirstOrDefaultAsync(s => s.Key == key);

        if (setting != null)
        {
            setting.Value = value;
            setting.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            await ReloadConfigurationAsync();
        }
    }

    public async Task AddCustomConfigurationAsync(string key, string value, string section = "Custom", string? description = null)
    {
        // Check if key already exists
        var existing = await _context.ConfigurationSettings
            .FirstOrDefaultAsync(s => s.Key == key);
        
        if (existing != null)
        {
            // Update existing
            existing.Value = value;
            existing.Description = description ?? existing.Description;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            // Create new
            var newSetting = new ConfigurationSetting
            {
                Key = key,
                Value = value,
                ValueType = "string",
                Section = section,
                Description = description ?? $"Custom configuration setting: {key}",
                IsSensitive = false,
                RequiresRestart = false,
                DefaultValue = value,
                ValidationRules = JsonSerializer.Serialize(new { }),
                SortOrder = 999, // Custom settings go at the bottom
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            
            _context.ConfigurationSettings.Add(newSetting);
        }
        
        await _context.SaveChangesAsync();
        await ReloadConfigurationAsync();
    }

    public async Task RemoveConfigurationAsync(string key)
    {
        var setting = await _context.ConfigurationSettings
            .FirstOrDefaultAsync(s => s.Key == key);
        
        if (setting != null)
        {
            _context.ConfigurationSettings.Remove(setting);
            await _context.SaveChangesAsync();
            await ReloadConfigurationAsync();
        }
    }

    public IConfiguration GetConfiguration()
    {
        lock (_configLock)
        {
            return _dbConfiguration ?? _originalConfiguration;
        }
    }

    public async Task ReloadConfigurationAsync()
    {
        try
        {
            var settings = await _context.ConfigurationSettings.ToListAsync();
            var configBuilder = new ConfigurationBuilder();
            
            // First add the original configuration as base
            configBuilder.AddConfiguration(_originalConfiguration);
            
            // Then add database configuration which will override
            var dbConfig = new Dictionary<string, string?>();
            foreach (var setting in settings)
            {
                dbConfig[setting.Key] = setting.Value;
            }
            
            configBuilder.AddInMemoryCollection(dbConfig);
            
            lock (_configLock)
            {
                _dbConfiguration = configBuilder.Build();
            }
            
            _logger.LogDebug("Configuration reloaded from database with {Count} settings", settings.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reload configuration from database");
        }
    }

    private static ConfigurationSettingDto MapToDto(ConfigurationSetting setting)
    {
        return new ConfigurationSettingDto
        {
            Id = setting.Id,
            Key = setting.Key,
            Value = setting.IsSensitive ? "***" : setting.Value,
            ValueType = setting.ValueType,
            Section = setting.Section,
            Description = setting.Description,
            IsSensitive = setting.IsSensitive,
            RequiresRestart = setting.RequiresRestart,
            DefaultValue = setting.DefaultValue,
            ValidationRules = setting.ValidationRules,
            SortOrder = setting.SortOrder,
            UpdatedAt = setting.UpdatedAt
        };
    }

    private static string GetSectionDisplayName(string section)
    {
        return section switch
        {
            "OpenAI" => "OpenAI Configuration",
            "Embedding" => "Embedding Settings",
            "Redis" => "Redis Cache",
            "Voice" => "Voice Services",
            "Server" => "Server Settings",
            "Worker" => "Background Workers",
            _ => section
        };
    }

    private static string GetSectionDescription(string section)
    {
        return section switch
        {
            "OpenAI" => "OpenAI API settings for GPT models, embeddings, and voice services",
            "Embedding" => "Text embedding configuration for semantic search",
            "Redis" => "Redis server configuration for caching and vector operations",
            "Voice" => "Text-to-speech and speech-to-text provider settings",
            "Server" => "Server configuration including ports and CORS settings",
            "Worker" => "Background worker processes for embedding, classification, and knowledge graph tasks",
            _ => $"Configuration settings for {section}"
        };
    }

    private static ValidationError? ValidateSetting(ConfigurationSetting setting, string value)
    {
        try
        {
            var rules = JsonSerializer.Deserialize<JsonElement>(setting.ValidationRules);

            // Type validation
            switch (setting.ValueType)
            {
                case "number":
                    if (!double.TryParse(value, out var numValue))
                        return new ValidationError { Key = setting.Key, Message = "Value must be a number", Code = "INVALID_TYPE" };
                    
                    if (rules.TryGetProperty("min", out var min) && numValue < min.GetDouble())
                        return new ValidationError { Key = setting.Key, Message = $"Value must be at least {min.GetDouble()}", Code = "MIN_VALUE" };
                    
                    if (rules.TryGetProperty("max", out var max) && numValue > max.GetDouble())
                        return new ValidationError { Key = setting.Key, Message = $"Value must be at most {max.GetDouble()}", Code = "MAX_VALUE" };
                    break;

                case "string":
                    if (rules.TryGetProperty("required", out var required) && required.GetBoolean() && string.IsNullOrWhiteSpace(value))
                        return new ValidationError { Key = setting.Key, Message = "Value is required", Code = "REQUIRED" };
                    
                    if (rules.TryGetProperty("minLength", out var minLen) && value.Length < minLen.GetInt32())
                        return new ValidationError { Key = setting.Key, Message = $"Value must be at least {minLen.GetInt32()} characters", Code = "MIN_LENGTH" };
                    
                    if (rules.TryGetProperty("options", out var options))
                    {
                        var validOptions = options.EnumerateArray().Select(o => o.GetString()).ToArray();
                        if (!validOptions.Contains(value))
                            return new ValidationError { Key = setting.Key, Message = $"Value must be one of: {string.Join(", ", validOptions)}", Code = "INVALID_OPTION" };
                    }
                    break;

                case "json":
                    try
                    {
                        JsonSerializer.Deserialize<JsonElement>(value);
                    }
                    catch
                    {
                        return new ValidationError { Key = setting.Key, Message = "Value must be valid JSON", Code = "INVALID_JSON" };
                    }
                    break;
            }

            return null;
        }
        catch
        {
            return null; // Skip validation if rules are malformed
        }
    }

    private async Task<(bool IsError, string Message, string Code)?> ValidateProviderSpecificAsync(string key, string value)
    {
        try
        {
            switch (key)
            {
                case "OpenAI:ApiKey":
                    if (string.IsNullOrWhiteSpace(value))
                        return (true, "OpenAI API key is required", "REQUIRED");
                    
                    // Test API key (optional - could make actual API call)
                    if (!value.StartsWith("sk-"))
                        return (false, "API key format looks unusual", "FORMAT_WARNING");
                    break;

                case "Redis:Connection":
                    if (string.IsNullOrWhiteSpace(value))
                        return (true, "Redis connection string is required", "REQUIRED");
                    
                    // Test Redis connection (simplified)
                    var parts = value.Split(':');
                    if (parts.Length != 2 || !int.TryParse(parts[1], out var port) || port <= 0)
                        return (true, "Invalid Redis connection format. Use host:port", "INVALID_FORMAT");
                    break;

                case "Embedding:Provider":
                    // Check if provider-specific settings exist
                    if (value == "openai")
                    {
                        var apiKey = await GetConfigurationValueAsync("OpenAI:ApiKey");
                        if (string.IsNullOrWhiteSpace(apiKey))
                            return (false, "OpenAI API key is required for OpenAI embedding provider", "DEPENDENCY_WARNING");
                    }
                    break;
            }

            return null;
        }
        catch
        {
            return null;
        }
    }
}
