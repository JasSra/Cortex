using CortexApi.Models;
using CortexApi.Data;
using CortexApi.Services;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CortexApi.Services;

public interface IChatToolsService
{
    Task<ChatToolsResponse> ProcessChatWithToolsAsync(ChatToolsRequest request);
    Task<ToolResult> ExecuteToolAsync(ToolRequest toolRequest);
    List<string> GetAvailableTools();
}

public class ChatToolsService : IChatToolsService
{
    private readonly CortexDbContext _context;
    private readonly ISearchService _searchService;
    private readonly IClassificationService _classificationService;
    private readonly IGraphService _graphService;
    private readonly ILogger<ChatToolsService> _logger;
    private readonly IRedactionService _redactionService;

    private readonly Dictionary<string, Func<Dictionary<string, object>, Task<ToolResult>>> _tools;

    public ChatToolsService(
        CortexDbContext context,
        ISearchService searchService,
        IClassificationService classificationService,
        IGraphService graphService,
    ILogger<ChatToolsService> logger,
    IRedactionService redactionService)
    {
        _context = context;
        _searchService = searchService;
        _classificationService = classificationService;
        _graphService = graphService;
        _logger = logger;
    _redactionService = redactionService;

        // Initialize tool registry
        _tools = new Dictionary<string, Func<Dictionary<string, object>, Task<ToolResult>>>
        {
            ["search_hybrid"] = ExecuteSearchHybridAsync,
            ["FindNotes"] = ExecuteSearchHybridAsync, // Alias
            ["tag_apply"] = ExecuteTagApplyAsync,
            ["TagNote"] = ExecuteTagApplyAsync, // Alias
            ["TagNotes"] = ExecuteTagApplyAsync, // Alias
            ["remove_tags"] = ExecuteRemoveTagsAsync,
            ["UntagNotes"] = ExecuteRemoveTagsAsync, // Alias
            ["set_sensitivity"] = ExecuteSetSensitivityAsync,
            ["SetSensitivity"] = ExecuteSetSensitivityAsync, // Alias
            ["summarize_notes"] = ExecuteSummarizeNotesAsync,
            ["SummarizeNotes"] = ExecuteSummarizeNotesAsync, // Alias
            ["redact_preview"] = ExecuteRedactPreviewAsync,
            ["RedactPreview"] = ExecuteRedactPreviewAsync, // Alias
            ["link_probe"] = ExecuteLinkProbeAsync
        };
    }

    public List<string> GetAvailableTools()
    {
        return _tools.Keys.ToList();
    }

    public async Task<ChatToolsResponse> ProcessChatWithToolsAsync(ChatToolsRequest request)
    {
        try
        {
            _logger.LogInformation("Processing chat with tools: {Query}", request.Query);

            // Analyze query to determine if tools are needed
            var suggestedTools = await AnalyzeQueryForToolsAsync(request.Query, request.Context);
            
            // Generate response
            var response = await GenerateResponseWithToolsAsync(request.Query, suggestedTools);
            
            return new ChatToolsResponse
            {
                Response = response,
                SuggestedTools = suggestedTools,
                RequiresConfirmation = suggestedTools.Any(t => t.RequiresConfirmation)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing chat with tools");
            return new ChatToolsResponse
            {
                Response = "I apologize, but I encountered an error processing your request. Please try again.",
                SuggestedTools = new List<ToolRequest>(),
                RequiresConfirmation = false
            };
        }
    }

    public async Task<ToolResult> ExecuteToolAsync(ToolRequest toolRequest)
    {
        try
        {
            _logger.LogInformation("Executing tool: {Tool}", toolRequest.Tool);

            if (!_tools.ContainsKey(toolRequest.Tool))
            {
                return new ToolResult
                {
                    Tool = toolRequest.Tool,
                    Success = false,
                    Error = $"Unknown tool: {toolRequest.Tool}"
                };
            }

            return await _tools[toolRequest.Tool](toolRequest.Parameters);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing tool {Tool}", toolRequest.Tool);
            return new ToolResult
            {
                Tool = toolRequest.Tool,
                Success = false,
                Error = ex.Message
            };
        }
    }

    private Task<List<ToolRequest>> AnalyzeQueryForToolsAsync(string query, Dictionary<string, object> context)
    {
        var suggestedTools = new List<ToolRequest>();
        var queryLower = query.ToLowerInvariant();

        // Search patterns
        if (queryLower.Contains("search") || queryLower.Contains("find") || 
            queryLower.Contains("look for") || queryLower.Contains("show me"))
        {
            suggestedTools.Add(new ToolRequest
            {
                Tool = "search_hybrid",
                Parameters = new Dictionary<string, object>
                {
                    ["q"] = ExtractSearchQuery(query),
                    ["k"] = 10,
                    ["filters"] = new Dictionary<string, object>()
                },
                RequiresConfirmation = false
            });
        }

        // Tagging patterns
        if (queryLower.Contains("tag") || queryLower.Contains("categorize") ||
            queryLower.Contains("label"))
        {
            var noteIds = ExtractNoteIds(context);
            var tags = ExtractTags(query);
            
            if (noteIds.Any() && tags.Any())
            {
                suggestedTools.Add(new ToolRequest
                {
                    Tool = "tag_apply",
                    Parameters = new Dictionary<string, object>
                    {
                        ["ids"] = noteIds,
                        ["tags"] = tags
                    },
                    RequiresConfirmation = noteIds.Count > 1 // Bulk operations need confirmation
                });
            }
        }

        // Redaction patterns
        if (queryLower.Contains("redact") || queryLower.Contains("hide") ||
            queryLower.Contains("sensitive"))
        {
            var noteId = ExtractSingleNoteId(context);
            if (!string.IsNullOrEmpty(noteId))
            {
                suggestedTools.Add(new ToolRequest
                {
                    Tool = "redact_preview",
                    Parameters = new Dictionary<string, object>
                    {
                        ["noteId"] = noteId,
                        ["policy"] = "default"
                    },
                    RequiresConfirmation = true
                });
            }
        }

        // Relationship patterns
        if (queryLower.Contains("relation") || queryLower.Contains("connect") ||
            queryLower.Contains("link") || queryLower.Contains("between"))
        {
            var entities = ExtractEntityMentions(query);
            if (entities.Count >= 2)
            {
                suggestedTools.Add(new ToolRequest
                {
                    Tool = "link_probe",
                    Parameters = new Dictionary<string, object>
                    {
                        ["entityA"] = entities[0],
                        ["entityB"] = entities[1]
                    },
                    RequiresConfirmation = false
                });
            }
        }

    return Task.FromResult(suggestedTools);
    }

    private Task<string> GenerateResponseWithToolsAsync(string query, List<ToolRequest> suggestedTools)
    {
        if (!suggestedTools.Any())
        {
        return Task.FromResult("I understand your request. How can I help you with your notes?");
        }

        var response = "I can help you with that. ";
        
        foreach (var tool in suggestedTools)
        {
            switch (tool.Tool)
            {
                case "search_hybrid":
                case "FindNotes":
                    response += "I'll search through your notes for relevant content. ";
                    break;
                case "tag_apply":
                case "TagNote":
                case "TagNotes":
                    response += "I can apply tags to organize your notes. ";
                    break;
                case "redact_preview":
                case "RedactPreview":
                    response += "I'll show you a preview of what would be redacted for sensitive content. ";
                    break;
                case "link_probe":
                    response += "I'll check the relationships between those entities. ";
                    break;
            }
        }

        if (suggestedTools.Any(t => t.RequiresConfirmation))
        {
            response += "Some of these actions require confirmation before proceeding.";
        }

    return Task.FromResult(response.Trim());
    }

    private async Task<ToolResult> ExecuteSearchHybridAsync(Dictionary<string, object> parameters)
    {
        try
        {
            var query = parameters.GetValueOrDefault("q", "").ToString() ?? "";
            var k = Convert.ToInt32(parameters.GetValueOrDefault("k", 10));
            var filters = parameters.GetValueOrDefault("filters", new Dictionary<string, object>()) as Dictionary<string, object> ?? new();

            var fileTypesList = filters.GetValueOrDefault("fileTypes", new List<string>()) as List<string> ?? new();
            var searchRequest = new AdvancedSearchRequest
            {
                Q = query,
                K = k,
                FileTypes = fileTypesList.ToArray()
            };

            var searchResults = await _searchService.SearchAdvancedAsync(searchRequest, "default");

            return new ToolResult
            {
                Tool = "search_hybrid",
                Success = true,
                Result = searchResults
            };
        }
        catch (Exception ex)
        {
            return new ToolResult
            {
                Tool = "search_hybrid",
                Success = false,
                Error = ex.Message
            };
        }
    }

    private async Task<ToolResult> ExecuteTagApplyAsync(Dictionary<string, object> parameters)
    {
        try
        {
            var ids = parameters.GetValueOrDefault("ids", new List<string>()) as List<string> ?? new();
            var tags = parameters.GetValueOrDefault("tags", new List<string>()) as List<string> ?? new();

            if (!ids.Any() || !tags.Any())
            {
                return new ToolResult { Tool = "tag_apply", Success = false, Error = "Missing ids or tags" };
            }

            // Ensure Tag records exist
            var existingTags = _context.Set<Tag>().Where(t => tags.Contains(t.Name)).ToList();
            var existingNames = existingTags.Select(t => t.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var newNames = tags.Where(n => !existingNames.Contains(n)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            foreach (var name in newNames)
            {
                var tag = new Tag { Name = name };
                _context.Add(tag);
                existingTags.Add(tag);
            }
            await _context.SaveChangesAsync();

            var tagByName = existingTags.ToDictionary(t => t.Name, t => t, StringComparer.OrdinalIgnoreCase);

            // Apply NoteTag links and update Note.Tags string for quick filters
            var notes = _context.Notes.Where(n => ids.Contains(n.Id)).ToList();
            int createdLinks = 0;
            foreach (var note in notes)
            {
                var current = _context.Set<NoteTag>().Where(nt => nt.NoteId == note.Id).Select(nt => nt.TagId).ToHashSet();
                foreach (var name in tags)
                {
                    var tagId = tagByName[name].Id;
                    if (current.Add(tagId))
                    {
                        _context.Add(new NoteTag { NoteId = note.Id, TagId = tagId });
                        createdLinks++;
                    }
                }
                // Update note.Tags string (comma-separated)
                var finalTagNames = _context.Set<NoteTag>().Where(nt => nt.NoteId == note.Id)
                    .Join(_context.Set<Tag>(), nt => nt.TagId, t => t.Id, (nt, t) => t.Name)
                    .ToList();
                note.Tags = string.Join(",", finalTagNames.Distinct(StringComparer.OrdinalIgnoreCase));
            }
            await _context.SaveChangesAsync();

            return new ToolResult
            {
                Tool = "tag_apply",
                Success = true,
                Result = new { Notes = notes.Select(n => new { n.Id, n.Tags }).ToList(), CreatedLinks = createdLinks }
            };
        }
        catch (Exception ex)
        {
            return new ToolResult
            {
                Tool = "tag_apply",
                Success = false,
                Error = ex.Message
            };
        }
    }

    private async Task<ToolResult> ExecuteRemoveTagsAsync(Dictionary<string, object> parameters)
    {
        try
        {
            var ids = parameters.GetValueOrDefault("ids", new List<string>()) as List<string> ?? new();
            var tags = parameters.GetValueOrDefault("tags", new List<string>()) as List<string> ?? new();
            var removeAll = Convert.ToBoolean(parameters.GetValueOrDefault("all", false));

            if (!ids.Any())
            {
                return new ToolResult { Tool = "remove_tags", Success = false, Error = "Missing ids" };
            }

            var notes = _context.Notes.Where(n => ids.Contains(n.Id)).ToList();
            var noteIds = notes.Select(n => n.Id).ToList();

            if (removeAll)
            {
                var links = _context.Set<NoteTag>().Where(nt => noteIds.Contains(nt.NoteId));
                _context.RemoveRange(links);
                foreach (var n in notes) n.Tags = string.Empty;
                await _context.SaveChangesAsync();
                return new ToolResult { Tool = "remove_tags", Success = true, Result = new { Notes = notes.Select(n => new { n.Id, n.Tags }) } };
            }

            if (!tags.Any())
            {
                return new ToolResult { Tool = "remove_tags", Success = false, Error = "Missing tags (or set all=true)" };
            }

            var tagIds = _context.Set<Tag>().Where(t => tags.Contains(t.Name)).Select(t => t.Id).ToList();
            var toRemove = _context.Set<NoteTag>().Where(nt => noteIds.Contains(nt.NoteId) && tagIds.Contains(nt.TagId));
            _context.RemoveRange(toRemove);
            await _context.SaveChangesAsync();

            // Rebuild Note.Tags strings
            foreach (var n in notes)
            {
                var finalTagNames = _context.Set<NoteTag>().Where(nt => nt.NoteId == n.Id)
                    .Join(_context.Set<Tag>(), nt => nt.TagId, t => t.Id, (nt, t) => t.Name)
                    .ToList();
                n.Tags = string.Join(",", finalTagNames.Distinct(StringComparer.OrdinalIgnoreCase));
            }
            await _context.SaveChangesAsync();

            return new ToolResult { Tool = "remove_tags", Success = true, Result = new { Notes = notes.Select(n => new { n.Id, n.Tags }) } };
        }
        catch (Exception ex)
        {
            return new ToolResult { Tool = "remove_tags", Success = false, Error = ex.Message };
        }
    }

    private async Task<ToolResult> ExecuteRedactPreviewAsync(Dictionary<string, object> parameters)
    {
        try
        {
            var noteId = parameters.GetValueOrDefault("noteId", "").ToString() ?? "";
            var policy = parameters.GetValueOrDefault("policy", "default").ToString() ?? "default";
            if (string.IsNullOrWhiteSpace(noteId))
            {
                return new ToolResult { Tool = "redact_preview", Success = false, Error = "Missing noteId" };
            }
            var preview = await _redactionService.PreviewRedactionAsync(noteId, policy);
            return new ToolResult
            {
                Tool = "redact_preview",
                Success = true,
                Result = preview
            };
        }
        catch (Exception ex)
        {
            return new ToolResult
            {
                Tool = "redact_preview",
                Success = false,
                Error = ex.Message
            };
        }
    }

    private async Task<ToolResult> ExecuteSetSensitivityAsync(Dictionary<string, object> parameters)
    {
        try
        {
            var ids = parameters.GetValueOrDefault("ids", new List<string>()) as List<string> ?? new();
            var levelObj = parameters.GetValueOrDefault("level", 0);
            var level = Convert.ToInt32(levelObj);
            level = Math.Max(0, Math.Min(3, level));

            if (!ids.Any())
            {
                return new ToolResult { Tool = "set_sensitivity", Success = false, Error = "Missing ids" };
            }

            var notes = _context.Notes.Where(n => ids.Contains(n.Id)).ToList();
            foreach (var n in notes)
            {
                n.SensitivityLevel = level;
            }
            await _context.SaveChangesAsync();

            return new ToolResult
            {
                Tool = "set_sensitivity",
                Success = true,
                Result = notes.Select(n => new { n.Id, n.SensitivityLevel }).ToList()
            };
        }
        catch (Exception ex)
        {
            return new ToolResult { Tool = "set_sensitivity", Success = false, Error = ex.Message };
        }
    }

    private async Task<ToolResult> ExecuteLinkProbeAsync(Dictionary<string, object> parameters)
    {
        try
        {
            var entityA = parameters.GetValueOrDefault("entityA", "").ToString() ?? "";
            var entityB = parameters.GetValueOrDefault("entityB", "").ToString() ?? "";

            // Find relationships between entities
            var edges = await _context.Edges
                .Where(e => (e.FromEntity.Value == entityA && e.ToEntity.Value == entityB) ||
                           (e.FromEntity.Value == entityB && e.ToEntity.Value == entityA))
                .Include(e => e.FromEntity)
                .Include(e => e.ToEntity)
                .ToListAsync();

            return new ToolResult
            {
                Tool = "link_probe",
                Success = true,
                Result = new { 
                    EntityA = entityA, 
                    EntityB = entityB, 
                    Relationships = edges.Select(e => new { e.RelationType, e.Confidence })
                }
            };
        }
        catch (Exception ex)
        {
            return new ToolResult
            {
                Tool = "link_probe",
                Success = false,
                Error = ex.Message
            };
        }
    }

    // Helper methods for query parsing
    private string ExtractSearchQuery(string query)
    {
        // Simple implementation - could be enhanced with NLP
        var searchWords = new[] { "search", "find", "look for", "show me" };
        var queryLower = query.ToLowerInvariant();
        
        foreach (var word in searchWords)
        {
            var index = queryLower.IndexOf(word);
            if (index >= 0)
            {
                var afterWord = query.Substring(index + word.Length).Trim();
                return afterWord.Length > 0 ? afterWord : query;
            }
        }
        
        return query;
    }

    private List<string> ExtractNoteIds(Dictionary<string, object> context)
    {
        if (context.TryGetValue("noteIds", out var noteIdsObj) && noteIdsObj is List<string> noteIds)
        {
            return noteIds;
        }
        return new List<string>();
    }

    private List<string> ExtractTags(string query)
    {
        // Simple tag extraction - could be enhanced
        var words = query.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return words.Where(w => w.StartsWith("#")).Select(w => w.TrimStart('#')).ToList();
    }

    private string ExtractSingleNoteId(Dictionary<string, object> context)
    {
        if (context.TryGetValue("noteId", out var noteIdObj))
        {
            return noteIdObj.ToString() ?? "";
        }
        return "";
    }

    private List<string> ExtractEntityMentions(string query)
    {
        // Simple entity mention extraction - could be enhanced with NER
        var words = query.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return words.Where(w => char.IsUpper(w[0]) && w.Length > 2).ToList();
    }

    private async Task<ToolResult> ExecuteSummarizeNotesAsync(Dictionary<string, object> parameters)
    {
        try
        {
            var ids = parameters.GetValueOrDefault("ids", new List<string>()) as List<string> ?? new();
            var maxLen = Convert.ToInt32(parameters.GetValueOrDefault("maxLen", 200));
            var persist = Convert.ToBoolean(parameters.GetValueOrDefault("persist", false));

            if (!ids.Any())
            {
                return new ToolResult { Tool = "summarize_notes", Success = false, Error = "Missing ids" };
            }

            var notes = _context.Notes.Where(n => ids.Contains(n.Id)).ToList();
            var results = new List<object>();
            foreach (var n in notes)
            {
                var summary = SimpleSummarize(n.Content, maxLen);
                if (persist)
                {
                    n.Summary = summary;
                }
                results.Add(new { n.Id, Summary = summary });
            }
            if (persist) await _context.SaveChangesAsync();

            return new ToolResult { Tool = "summarize_notes", Success = true, Result = results };
        }
        catch (Exception ex)
        {
            return new ToolResult { Tool = "summarize_notes", Success = false, Error = ex.Message };
        }
    }

    private string SimpleSummarize(string text, int maxLen)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        var normalized = text.Replace("\n", " ").Replace("\r", " ").Trim();
        if (normalized.Length <= maxLen) return normalized;
        // naive sentence boundary
        var parts = normalized.Split(new[] { ". ", "? ", "! " }, StringSplitOptions.RemoveEmptyEntries);
        var sb = new System.Text.StringBuilder();
        foreach (var p in parts)
        {
            if (sb.Length + p.Length + 2 > maxLen) break;
            if (sb.Length > 0) sb.Append(". ");
            sb.Append(p.Trim());
        }
        if (sb.Length == 0) return normalized.Substring(0, Math.Min(maxLen, normalized.Length));
        return sb.ToString();
    }
}
