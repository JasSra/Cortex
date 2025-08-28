using System.Text.RegularExpressions;
using CortexApi.Models;

namespace CortexApi.Services;

public interface ISecretsDetectionService
{
    Task<List<SecretDetection>> DetectSecretsAsync(string text);
    Task<List<TextSpan>> CreateSecretSpansAsync(string noteId, string text);
}

public class SecretsDetectionService : ISecretsDetectionService
{
    private readonly ILogger<SecretsDetectionService> _logger;
    private readonly Dictionary<string, SecretRule> _secretRules;

    public SecretsDetectionService(ILogger<SecretsDetectionService> logger)
    {
        _logger = logger;
        _secretRules = InitializeSecretRules();
    }

    public async Task<List<SecretDetection>> DetectSecretsAsync(string text)
    {
        var detections = new List<SecretDetection>();

        foreach (var (key, rule) in _secretRules)
        {
            try
            {
                var matches = rule.Pattern.Matches(text);
                foreach (Match match in matches)
                {
                    if (match.Success && !IsAllowlistedValue(match.Value, rule))
                    {
                        detections.Add(new SecretDetection
                        {
                            Type = rule.Type,
                            Value = MaskSecret(match.Value),
                            Start = match.Index,
                            End = match.Index + match.Length,
                            Severity = rule.Severity
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error processing secret rule {Rule} for type {Type}", key, rule.Type);
            }
        }

        // Remove duplicates and overlapping detections
        var uniqueDetections = RemoveOverlappingSecrets(detections);
        
        _logger.LogInformation("Detected {Count} secrets in text of length {Length}", 
            uniqueDetections.Count, text.Length);

        return await Task.FromResult(uniqueDetections);
    }

    public async Task<List<TextSpan>> CreateSecretSpansAsync(string noteId, string text)
    {
        var secretDetections = await DetectSecretsAsync(text);
        var spans = new List<TextSpan>();

        foreach (var detection in secretDetections)
        {
            spans.Add(new TextSpan
            {
                NoteId = noteId,
                Start = detection.Start,
                End = detection.End,
                Label = $"SECRET_{detection.Type}",
                Confidence = GetConfidenceFromSeverity(detection.Severity),
                CreatedAt = DateTime.UtcNow
            });
        }

        return spans;
    }

    private Dictionary<string, SecretRule> InitializeSecretRules()
    {
        var rules = new Dictionary<string, SecretRule>();

        try
        {
            // API Keys - Generic patterns
            rules["generic_api_key"] = new SecretRule
            {
                Type = "API_KEY",
                Pattern = new Regex(@"\b(?:api[_-]?key|apikey|api[_-]?token)[\s=:'""`]*([a-zA-Z0-9_\-]{20,})\b", 
                    RegexOptions.IgnoreCase | RegexOptions.Compiled),
                Severity = "high",
                AllowList = new[] { "YOUR_API_KEY", "API_KEY_HERE", "SAMPLE_KEY" }
            };

            // AWS Access Keys
            rules["aws_access_key"] = new SecretRule
            {
                Type = "AWS_ACCESS_KEY",
                Pattern = new Regex(@"\b(AKIA[0-9A-Z]{16})\b", RegexOptions.Compiled),
                Severity = "critical"
            };

            // AWS Secret Keys
            rules["aws_secret_key"] = new SecretRule
            {
                Type = "AWS_SECRET_KEY",
                Pattern = new Regex(@"\b([A-Za-z0-9/+=]{40})\b", RegexOptions.Compiled),
                Severity = "critical"
            };

            // JWT Tokens
            rules["jwt_token"] = new SecretRule
            {
                Type = "JWT_TOKEN",
                Pattern = new Regex(@"\beyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]*\b", 
                    RegexOptions.Compiled),
                Severity = "high"
            };

            // GitHub Personal Access Tokens
            rules["github_token"] = new SecretRule
            {
                Type = "GITHUB_TOKEN",
                Pattern = new Regex(@"\bgh[ps]_[A-Za-z0-9_]{36,251}\b", RegexOptions.Compiled),
                Severity = "critical"
            };

            // GitHub Classic Tokens
            rules["github_classic"] = new SecretRule
            {
                Type = "GITHUB_CLASSIC_TOKEN",
                Pattern = new Regex(@"\b[0-9a-f]{40}\b", RegexOptions.Compiled),
                Severity = "high"
            };

            // OpenAI API Keys
            rules["openai_key"] = new SecretRule
            {
                Type = "OPENAI_API_KEY",
                Pattern = new Regex(@"\bsk-[A-Za-z0-9]{48}\b", RegexOptions.Compiled),
                Severity = "critical"
            };

            // Slack Tokens
            rules["slack_token"] = new SecretRule
            {
                Type = "SLACK_TOKEN",
                Pattern = new Regex(@"\bxox[baprs]-[A-Za-z0-9\-]{10,72}\b", RegexOptions.Compiled),
                Severity = "high"
            };

            // Discord Bot Tokens
            rules["discord_token"] = new SecretRule
            {
                Type = "DISCORD_TOKEN",
                Pattern = new Regex(@"\b[MN][A-Za-z\d]{23}\.[A-Za-z\d]{6}\.[A-Za-z\d\-_]{27}\b", 
                    RegexOptions.Compiled),
                Severity = "high"
            };

            // Google API Keys
            rules["google_api_key"] = new SecretRule
            {
                Type = "GOOGLE_API_KEY",
                Pattern = new Regex(@"\bAIza[0-9A-Za-z_\-]{35}\b", RegexOptions.Compiled),
                Severity = "high"
            };

            // Private SSH Keys
            rules["ssh_private_key"] = new SecretRule
            {
                Type = "SSH_PRIVATE_KEY",
                Pattern = new Regex(@"-----BEGIN[A-Z ]*PRIVATE KEY-----[A-Za-z0-9+/=\s]*-----END[A-Z ]*PRIVATE KEY-----", 
                    RegexOptions.Compiled | RegexOptions.Singleline),
                Severity = "critical"
            };

            // Database Connection Strings
            rules["connection_string"] = new SecretRule
            {
                Type = "CONNECTION_STRING",
                Pattern = new Regex(@"(?:Server|Data Source|Host)=.*?(?:Password|Pwd)=([^;]+)", 
                    RegexOptions.IgnoreCase | RegexOptions.Compiled),
                Severity = "critical"
            };

            // Basic Auth in URLs
            rules["basic_auth_url"] = new SecretRule
            {
                Type = "BASIC_AUTH_URL",
                Pattern = new Regex(@"https?://[^/\s:]+:([^@\s]+)@[^\s]+", 
                    RegexOptions.IgnoreCase | RegexOptions.Compiled),
                Severity = "high"
            };

            // Generic passwords in config
            rules["password_assignment"] = new SecretRule
            {
                Type = "PASSWORD",
                Pattern = new Regex(@"(?:password|pwd|pass)[\s=:'""`]+([^\s'""`]{8,})", 
                    RegexOptions.IgnoreCase | RegexOptions.Compiled),
                Severity = "medium",
                AllowList = new[] { "password", "PASSWORD", "your_password", "change_me", "secret", "***" }
            };

            // Stripe API Keys
            rules["stripe_key"] = new SecretRule
            {
                Type = "STRIPE_API_KEY",
                Pattern = new Regex(@"\b(?:sk|pk)_(?:test|live)_[0-9A-Za-z]{24,34}\b", 
                    RegexOptions.Compiled),
                Severity = "critical"
            };

            // Azure Storage Keys
            rules["azure_storage_key"] = new SecretRule
            {
                Type = "AZURE_STORAGE_KEY",
                Pattern = new Regex(@"\b[A-Za-z0-9+/]{88}==\b", RegexOptions.Compiled),
                Severity = "high"
            };

            // Mailgun API Keys
            rules["mailgun_key"] = new SecretRule
            {
                Type = "MAILGUN_API_KEY",
                Pattern = new Regex(@"\bkey-[0-9a-f]{32}\b", RegexOptions.Compiled),
                Severity = "high"
            };

            _logger.LogInformation("Initialized {Count} secret detection rules", rules.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error initializing secret detection rules");
        }

        return rules;
    }

    private bool IsAllowlistedValue(string value, SecretRule rule)
    {
        if (rule.AllowList == null || rule.AllowList.Length == 0)
            return false;

        return rule.AllowList.Any(allowed => 
            string.Equals(value, allowed, StringComparison.OrdinalIgnoreCase) ||
            value.Contains(allowed, StringComparison.OrdinalIgnoreCase));
    }

    private string MaskSecret(string secret)
    {
        if (secret.Length <= 8)
            return new string('*', secret.Length);

        // Show first 4 and last 4 characters, mask the middle
        return secret.Substring(0, 4) + new string('*', secret.Length - 8) + secret.Substring(secret.Length - 4);
    }

    private double GetConfidenceFromSeverity(string severity)
    {
        return severity switch
        {
            "critical" => 0.95,
            "high" => 0.85,
            "medium" => 0.7,
            "low" => 0.5,
            _ => 0.6
        };
    }

    private List<SecretDetection> RemoveOverlappingSecrets(List<SecretDetection> detections)
    {
        if (!detections.Any()) return detections;

        // Sort by start position
        var sorted = detections.OrderBy(d => d.Start).ToList();
        var result = new List<SecretDetection>();

        foreach (var current in sorted)
        {
            // Check if current overlaps with any detection already in result
            var overlaps = result.Any(existing =>
                (current.Start >= existing.Start && current.Start < existing.End) ||
                (current.End > existing.Start && current.End <= existing.End) ||
                (current.Start <= existing.Start && current.End >= existing.End));

            if (!overlaps)
            {
                result.Add(current);
            }
            else
            {
                // Keep the one with higher severity (critical > high > medium > low)
                var overlapping = result.Where(existing =>
                    (current.Start >= existing.Start && current.Start < existing.End) ||
                    (current.End > existing.Start && current.End <= existing.End) ||
                    (current.Start <= existing.Start && current.End >= existing.End)).ToList();

                var currentSeverityScore = GetSeverityScore(current.Severity);
                var maxExistingSeverity = overlapping.Max(o => GetSeverityScore(o.Severity));

                if (currentSeverityScore > maxExistingSeverity)
                {
                    // Remove overlapping detections and add current
                    foreach (var toRemove in overlapping)
                    {
                        result.Remove(toRemove);
                    }
                    result.Add(current);
                }
            }
        }

        return result.OrderBy(d => d.Start).ToList();
    }

    private int GetSeverityScore(string severity)
    {
        return severity switch
        {
            "critical" => 4,
            "high" => 3,
            "medium" => 2,
            "low" => 1,
            _ => 0
        };
    }
}

public class SecretRule
{
    public string Type { get; set; } = string.Empty;
    public Regex Pattern { get; set; } = null!;
    public string Severity { get; set; } = "medium";
    public string[]? AllowList { get; set; }
}
