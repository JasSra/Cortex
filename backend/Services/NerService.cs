using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.Tokenizers;
using F23.StringSimilarity;
using CortexApi.Models;
using CortexApi.Data;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CortexApi.Services;

public interface INerService
{
    Task<List<EntityExtraction>> ExtractEntitiesAsync(string text);
    Task<Entity?> FindCanonicalEntityAsync(string type, string value);
    Task<Entity> GetOrCreateCanonicalEntityAsync(string type, string value, double confidence = 1.0);
    Task<List<Edge>> GenerateEntityRelationsAsync(List<Entity> entities, string noteId);
}

public class NerService : INerService
{
    private readonly CortexDbContext _context;
    private readonly ILogger<NerService> _logger;
    private readonly IConfigurationService _configurationService;
    private readonly JaroWinkler _jaroWinkler;
    
    // NER model paths and configuration
    private readonly string? _modelPath;
    private readonly bool _useRuleBased;
    private readonly string _provider; // openai | onnx | rulebased
    
    // Entity type patterns for rule-based NER
    private readonly Dictionary<string, List<string>> _entityPatterns = new()
    {
        ["PERSON"] = new()
        {
            @"\b[A-Z][a-z]+ [A-Z][a-z]+\b", // FirstName LastName
            @"\b(?:Mr|Ms|Mrs|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b" // Titles
        },
        ["ORG"] = new()
        {
            @"\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\s+(?:Inc|Corp|LLC|Ltd|Company|Co|Group|Organization|Org)\b",
            @"\b(?:Microsoft|Google|Apple|Amazon|Meta|Tesla|OpenAI|GitHub)\b"
        },
        ["LOCATION"] = new()
        {
            @"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2,3}\b", // City, State/Country
            @"\b(?:New York|Los Angeles|London|Paris|Tokyo|Sydney|Brisbane|Melbourne)\b"
        },
        ["PROJECT"] = new()
        {
            @"\b[A-Z][a-zA-Z]*(?:-[A-Z][a-zA-Z]*)*\s+(?:Project|API|System|Platform|Framework)\b",
            @"\bProject\s+[A-Z][a-zA-Z]*\b"
        },
        ["ID"] = new()
        {
            @"\b[A-Z]{2,}-\d{3,}\b", // ABC-123 format
            @"\b\d{4,}-\d{2,}-\d{2,}\b" // YYYY-MM-DD or similar
        }
    };

    public NerService(CortexDbContext context, ILogger<NerService> logger, IConfigurationService configurationService)
    {
        _context = context;
        _logger = logger;
        _configurationService = configurationService;
        _jaroWinkler = new JaroWinkler();
        
        var config = _configurationService.GetConfiguration();
        _useRuleBased = config.GetValue<bool>("NER:UseRuleBased", true);
        _modelPath = config.GetValue<string>("NER:ModelPath", "");
        _provider = (config.GetValue<string>("NER:Provider", string.Empty) ?? string.Empty).ToLowerInvariant();
        
        _logger.LogInformation("NER Service initialized. Provider={Provider}, RuleBased={UseRuleBased}", string.IsNullOrEmpty(_provider) ? "(default)" : _provider, _useRuleBased);
    }

    public async Task<List<EntityExtraction>> ExtractEntitiesAsync(string text)
    {
        try
        {
            // Preferred provider first
            if (_provider == "openai")
            {
                var ai = await ExtractEntitiesOpenAiAsync(text);
                if (ai.Count > 0) return ai;
                _logger.LogDebug("OpenAI NER returned no entities; falling back to rule-based");
                return await ExtractEntitiesRuleBasedAsync(text);
            }
            else if (_provider == "onnx")
            {
                var onnx = await ExtractEntitiesOnnxAsync(text);
                if (onnx.Count > 0) return onnx;
                _logger.LogDebug("ONNX NER returned no entities; falling back to rule-based");
                return await ExtractEntitiesRuleBasedAsync(text);
            }

            // Legacy flags
            if (_useRuleBased)
            {
                return await ExtractEntitiesRuleBasedAsync(text);
            }
            else
            {
                return await ExtractEntitiesOnnxAsync(text);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error extracting entities from text");
            return new List<EntityExtraction>();
        }
    }

    private async Task<List<EntityExtraction>> ExtractEntitiesRuleBasedAsync(string text)
    {
        var extractions = new List<EntityExtraction>();
        
        foreach (var entityType in _entityPatterns.Keys)
        {
            foreach (var pattern in _entityPatterns[entityType])
            {
                var regex = new System.Text.RegularExpressions.Regex(pattern, 
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                var matches = regex.Matches(text);
                
                foreach (System.Text.RegularExpressions.Match match in matches)
                {
                    extractions.Add(new EntityExtraction
                    {
                        Type = entityType,
                        Value = match.Value.Trim(),
                        Start = match.Index,
                        End = match.Index + match.Length,
                        Confidence = 0.8 // Rule-based confidence
                    });
                }
            }
        }
        
        // Remove duplicates and overlaps
        extractions = RemoveOverlappingExtractions(extractions);
        
        _logger.LogDebug("Rule-based NER extracted {Count} entities", extractions.Count);
        return extractions;
    }

    private async Task<List<EntityExtraction>> ExtractEntitiesOnnxAsync(string text)
    {
        // Placeholder for ONNX model implementation
        // This would use TensorFlow.NET or Microsoft.ML.OnnxRuntime
        // For now, fallback to rule-based
        _logger.LogWarning("ONNX NER not implemented, falling back to rule-based");
        return await ExtractEntitiesRuleBasedAsync(text);
    }

    private async Task<List<EntityExtraction>> ExtractEntitiesOpenAiAsync(string text)
    {
        try
        {
            var config = _configurationService.GetConfiguration();
            var apiKey = config["OpenAI:ApiKey"] ?? config["OPENAI_API_KEY"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("OpenAI API key not configured for NER");
                return new List<EntityExtraction>();
            }

            // Keep prompt short; request JSON structured entities
            var model = config["OpenAI:NerModel"] ?? config["OPENAI_NER_MODEL"] ?? config["OpenAI:Model"] ?? config["OPENAI_MODEL"] ?? "gpt-4o-mini";
            var maxLen = 6000; // keep payload modest
            var sample = text.Length > maxLen ? text.Substring(0, maxLen) : text;

            var system = "You extract entities from text. Return JSON only with an 'entities' array. Types: PERSON, ORG, LOCATION, PROJECT, ID, CONCEPT.";
            var user = $"Text:\n{sample}\n\nReturn JSON: {{\"entities\":[{{\"type\":\"...\",\"value\":\"...\",\"start\":0,\"end\":0,\"confidence\":0.0}}]}}";

            using var http = new HttpClient();
            http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            var payload = new
            {
                model,
                messages = new object[]
                {
                    new { role = "system", content = system },
                    new { role = "user", content = user }
                },
                temperature = 0.0,
                response_format = new { type = "json_object" }
            };
            var json = System.Text.Json.JsonSerializer.Serialize(payload);
            using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            using var resp = await http.PostAsync("https://api.openai.com/v1/chat/completions", content);
            var body = await resp.Content.ReadAsStringAsync();
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("OpenAI NER failed: {Status} {Body}", (int)resp.StatusCode, body);
                return new List<EntityExtraction>();
            }

            using var doc = System.Text.Json.JsonDocument.Parse(body);
            var root = doc.RootElement;
            var contentStr = root.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "{}";

            using var parsed = System.Text.Json.JsonDocument.Parse(contentStr);
            var ents = new List<EntityExtraction>();
            if (parsed.RootElement.TryGetProperty("entities", out var arr) && arr.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                foreach (var el in arr.EnumerateArray())
                {
                    var type = el.TryGetProperty("type", out var t) ? (t.GetString() ?? "CONCEPT").ToUpperInvariant() : "CONCEPT";
                    var value = el.TryGetProperty("value", out var v) ? (v.GetString() ?? string.Empty).Trim() : string.Empty;
                    if (string.IsNullOrWhiteSpace(value)) continue;
                    var start = el.TryGetProperty("start", out var s) && s.ValueKind == System.Text.Json.JsonValueKind.Number ? s.GetInt32() : 0;
                    var end = el.TryGetProperty("end", out var e) && e.ValueKind == System.Text.Json.JsonValueKind.Number ? e.GetInt32() : Math.Min(start + value.Length, sample.Length);
                    var conf = el.TryGetProperty("confidence", out var c) && c.ValueKind == System.Text.Json.JsonValueKind.Number ? c.GetDouble() : 0.8;
                    ents.Add(new EntityExtraction { Type = type, Value = value, Start = start, End = end, Confidence = conf });
                }
            }
            return ents;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OpenAI NER error; falling back");
            return new List<EntityExtraction>();
        }
    }

    public async Task<Entity?> FindCanonicalEntityAsync(string type, string value)
    {
        const double similarityThreshold = 0.8;
        
        // First try exact match on canonical values
        var exactMatch = await _context.Entities
            .Where(e => e.Type == type && e.CanonicalValue == value)
            .FirstOrDefaultAsync();
            
        if (exactMatch != null)
            return exactMatch;
        
        // Try similarity matching
        var candidates = await _context.Entities
            .Where(e => e.Type == type)
            .ToListAsync();
            
        foreach (var candidate in candidates)
        {
            var similarity = _jaroWinkler.Similarity(value.ToLowerInvariant(), 
                candidate.CanonicalValue.ToLowerInvariant());
                
            if (similarity >= similarityThreshold)
            {
                _logger.LogDebug("Found similar entity: {Value} -> {Canonical} (similarity: {Similarity})", 
                    value, candidate.CanonicalValue, similarity);
                return candidate;
            }
        }
        
        return null;
    }

    public async Task<Entity> GetOrCreateCanonicalEntityAsync(string type, string value, double confidence = 1.0)
    {
        var canonical = await FindCanonicalEntityAsync(type, value);
        
        if (canonical != null)
        {
            // Update mention count and last seen
            canonical.MentionCount++;
            canonical.LastSeenAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return canonical;
        }
        
        // Create new canonical entity
        var entity = new Entity
        {
            Type = type,
            Value = value,
            CanonicalValue = value, // This entity becomes its own canonical form
            ConfidenceScore = confidence,
            MentionCount = 1,
            CreatedAt = DateTime.UtcNow,
            LastSeenAt = DateTime.UtcNow
        };
        
        _context.Entities.Add(entity);
        await _context.SaveChangesAsync();
        
        _logger.LogDebug("Created new canonical entity: {Type} - {Value}", type, value);
        return entity;
    }

    public async Task<List<Edge>> GenerateEntityRelationsAsync(List<Entity> entities, string noteId)
    {
        var edges = new List<Edge>();
        
        // Generate co-occurrence based relationships
        for (int i = 0; i < entities.Count; i++)
        {
            for (int j = i + 1; j < entities.Count; j++)
            {
                var entity1 = entities[i];
                var entity2 = entities[j];
                
                // Skip if edge already exists
                var existingEdge = await _context.Edges
                    .AnyAsync(e => (e.FromEntityId == entity1.Id && e.ToEntityId == entity2.Id) ||
                                  (e.FromEntityId == entity2.Id && e.ToEntityId == entity1.Id));
                                  
                if (existingEdge)
                    continue;
                
                // Determine relation type based on entity types
                var relationType = DetermineRelationType(entity1, entity2);
                var confidence = CalculateRelationConfidence(entity1, entity2);
                
                if (confidence > 0.3) // Only create edges with reasonable confidence
                {
                    edges.Add(new Edge
                    {
                        FromEntityId = entity1.Id,
                        ToEntityId = entity2.Id,
                        RelationType = relationType,
                        Confidence = confidence,
                        Source = "co-occurrence",
                        CreatedAt = DateTime.UtcNow
                    });
                }
            }
        }
        
        _logger.LogDebug("Generated {Count} entity relations for note {NoteId}", edges.Count, noteId);
        return edges;
    }

    private string DetermineRelationType(Entity entity1, Entity entity2)
    {
        // Simple heuristics for relation types
        if (entity1.Type == "PERSON" && entity2.Type == "ORG")
            return "works_at";
        if (entity1.Type == "PERSON" && entity2.Type == "LOCATION")
            return "located_in";
        if (entity1.Type == "PROJECT" && entity2.Type == "ORG")
            return "belongs_to";
        if (entity1.Type == entity2.Type)
            return "same_topic";
        
        return "references";
    }

    private double CalculateRelationConfidence(Entity entity1, Entity entity2)
    {
        // Base confidence for co-occurrence
        double confidence = 0.5;
        
        // Boost confidence for common entity type combinations
        if ((entity1.Type == "PERSON" && entity2.Type == "ORG") ||
            (entity1.Type == "PROJECT" && entity2.Type == "ORG"))
        {
            confidence += 0.2;
        }
        
        // Boost confidence based on mention counts
        var avgMentions = (entity1.MentionCount + entity2.MentionCount) / 2.0;
        if (avgMentions > 5)
            confidence += 0.1;
        
        return Math.Min(confidence, 1.0);
    }

    private List<EntityExtraction> RemoveOverlappingExtractions(List<EntityExtraction> extractions)
    {
        extractions = extractions.OrderBy(e => e.Start).ThenByDescending(e => e.Confidence).ToList();
        var result = new List<EntityExtraction>();
        
        foreach (var extraction in extractions)
        {
            bool overlaps = result.Any(r => 
                (extraction.Start >= r.Start && extraction.Start < r.End) ||
                (extraction.End > r.Start && extraction.End <= r.End) ||
                (extraction.Start <= r.Start && extraction.End >= r.End));
                
            if (!overlaps)
            {
                result.Add(extraction);
            }
        }
        
        return result;
    }
}

/// <summary>
/// Represents an entity extraction result
/// </summary>
public class EntityExtraction
{
    public string Type { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public int Start { get; set; }
    public int End { get; set; }
    public double Confidence { get; set; }
}
