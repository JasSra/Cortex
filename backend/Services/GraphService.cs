using CortexApi.Models;
using CortexApi.Data;
using Microsoft.EntityFrameworkCore;
using Neo4j.Driver;

namespace CortexApi.Services;

public interface IGraphService
{
    Task<GraphResponse> GetGraphAsync(GraphRequest request);
    Task<List<Edge>> CreateEntityRelationsAsync(List<Entity> entities, string noteId);
    Task<List<GraphNode>> GetConnectedEntitiesAsync(string entityId, int depth = 2);
    Task<List<string>> SuggestRelatedEntitiesAsync(string entityId);
    Task<Dictionary<string, int>> GetEntityStatisticsAsync();
    Task<List<Edge>> DiscoverCoOccurrenceRelationshipsAsync();
    Task<List<Edge>> DiscoverSemanticRelationshipsAsync();
    Task<List<Edge>> DiscoverTemporalRelationshipsAsync();
    Task<GraphInsights> AnalyzeGraphStructureAsync();
    Task CleanupUserEntitiesAsync(string userId);
    Task CleanupNoteEntitiesAsync(string noteId);
    Task<GraphRebuildResult> RebuildGraphAsync();
    Task<bool> LinkEntitiesAsync(string fromEntityId, string toEntityId, string relationType, double confidence = 0.8);
    Task<bool> UnlinkEntitiesAsync(string fromEntityId, string toEntityId);
    Task<List<GraphNode>> GetNotesForEntityAsync(string entityId);
    Task<List<GraphSuggestion>> GetConnectionSuggestionsAsync(string entityId, int maxSuggestions = 5);
    Task<List<GraphSuggestion>> GetGlobalSuggestionsAsync(int maxSuggestions = 10);
}

public class GraphService : IGraphService
{
    private readonly CortexDbContext _context;
    private readonly ILogger<GraphService> _logger;
    private readonly INerService _nerService;
    private readonly IDriver? _neo4jDriver;
    private readonly bool _useNeo4j;

    public GraphService(
        CortexDbContext context, 
        ILogger<GraphService> logger, 
        INerService nerService)
    {
        _context = context;
        _logger = logger;
        _nerService = nerService;
        
    // Explicitly disable Neo4j backend until implemented to avoid confusion
    _useNeo4j = false;
    _neo4jDriver = null; // not used while Neo4j path is disabled
    _logger.LogInformation("Graph Service initialized with backend: Postgres");
    }

    public async Task<GraphResponse> GetGraphAsync(GraphRequest request)
    {
        try
        {
            if (_useNeo4j && _neo4jDriver != null)
            {
                return await GetGraphNeo4jAsync(request);
            }
            else
            {
                return await GetGraphPostgresAsync(request);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving graph data");
            return new GraphResponse();
        }
    }

    private async Task<GraphResponse> GetGraphPostgresAsync(GraphRequest request)
    {
        var query = _context.Entities.AsQueryable();
        
        // Apply entity type filters
        if (request.EntityTypes.Any())
        {
            query = query.Where(e => request.EntityTypes.Contains(e.Type));
        }
        
        // Apply date filters
        if (request.FromDate.HasValue)
        {
            query = query.Where(e => e.LastSeenAt >= request.FromDate.Value);
        }
        if (request.ToDate.HasValue)
        {
            query = query.Where(e => e.LastSeenAt <= request.ToDate.Value);
        }
        
        List<Entity> entities;
        List<Edge> edges;
        
        if (!string.IsNullOrEmpty(request.Focus) && request.Focus.StartsWith("entity:"))
        {
            // Focus mode: get specific entity and its connections
            var focusEntityId = request.Focus["entity:".Length..];
            var focusEntity = await _context.Entities
                .FirstOrDefaultAsync(e => e.Id == focusEntityId);
                
            if (focusEntity == null)
            {
                return new GraphResponse();
            }
            
            // Get connected entities within depth
            var connectedEntityIds = await GetConnectedEntityIdsAsync(focusEntityId, request.Depth);
            entities = await query
                .Where(e => connectedEntityIds.Contains(e.Id))
                .ToListAsync();
                
            edges = await _context.Edges
                .Where(e => connectedEntityIds.Contains(e.FromEntityId) && 
                           connectedEntityIds.Contains(e.ToEntityId))
                .ToListAsync();
        }
        else
        {
            // General mode: get all entities matching filters
            entities = await query.Take(500).ToListAsync(); // Limit for performance
            
            var entityIds = entities.Select(e => e.Id).ToList();
            edges = await _context.Edges
                .Where(e => entityIds.Contains(e.FromEntityId) && 
                           entityIds.Contains(e.ToEntityId))
                .ToListAsync();
        }
        
        var nodes = entities.Select(e => new GraphNode
        {
            Id = e.Id,
            Type = e.Type,
            Value = e.CanonicalValue,
            ConnectionCount = e.OutgoingEdges.Count + e.IncomingEdges.Count,
            LastSeen = e.LastSeenAt
        }).ToList();
        
        var graphEdges = edges.Select(e => new GraphEdge
        {
            Id = e.Id,
            FromId = e.FromEntityId,
            ToId = e.ToEntityId,
            RelationType = e.RelationType,
            Confidence = e.Confidence
        }).ToList();
        
        return new GraphResponse
        {
            Nodes = nodes,
            Edges = graphEdges,
            TotalNodes = nodes.Count,
            TotalEdges = graphEdges.Count
        };
    }

    private async Task<GraphResponse> GetGraphNeo4jAsync(GraphRequest request)
    {
        // Placeholder for Neo4j implementation
        _logger.LogWarning("Neo4j graph retrieval not yet implemented, falling back to Postgres");
        return await GetGraphPostgresAsync(request);
    }

    private async Task<List<string>> GetConnectedEntityIdsAsync(string entityId, int depth)
    {
        var visited = new HashSet<string> { entityId };
        var currentLevel = new HashSet<string> { entityId };
        
        for (int i = 0; i < depth; i++)
        {
            var nextLevel = new HashSet<string>();
            
            var edges = await _context.Edges
                .Where(e => currentLevel.Contains(e.FromEntityId) || 
                           currentLevel.Contains(e.ToEntityId))
                .ToListAsync();
                
            foreach (var edge in edges)
            {
                if (!visited.Contains(edge.FromEntityId))
                {
                    nextLevel.Add(edge.FromEntityId);
                    visited.Add(edge.FromEntityId);
                }
                if (!visited.Contains(edge.ToEntityId))
                {
                    nextLevel.Add(edge.ToEntityId);
                    visited.Add(edge.ToEntityId);
                }
            }
            
            if (!nextLevel.Any())
                break;
                
            currentLevel = nextLevel;
        }
        
        return visited.ToList();
    }

    public async Task<List<Edge>> CreateEntityRelationsAsync(List<Entity> entities, string noteId)
    {
        var newEdges = await _nerService.GenerateEntityRelationsAsync(entities, noteId);
        
        foreach (var edge in newEdges)
        {
            _context.Edges.Add(edge);
        }
        
        await _context.SaveChangesAsync();
        
        _logger.LogInformation("Created {Count} entity relations for note {NoteId}", 
            newEdges.Count, noteId);
            
        return newEdges;
    }

    public async Task<List<GraphNode>> GetConnectedEntitiesAsync(string entityId, int depth = 2)
    {
        var connectedIds = await GetConnectedEntityIdsAsync(entityId, depth);
        
        var entities = await _context.Entities
            .Where(e => connectedIds.Contains(e.Id))
            .ToListAsync();
            
        return entities.Select(e => new GraphNode
        {
            Id = e.Id,
            Type = e.Type,
            Value = e.CanonicalValue,
            ConnectionCount = e.OutgoingEdges.Count + e.IncomingEdges.Count,
            LastSeen = e.LastSeenAt
        }).ToList();
    }

    public async Task<List<string>> SuggestRelatedEntitiesAsync(string entityId)
    {
        // Find entities that frequently co-occur with the given entity
        var relatedEdges = await _context.Edges
            .Where(e => e.FromEntityId == entityId || e.ToEntityId == entityId)
            .OrderByDescending(e => e.Confidence)
            .Take(10)
            .ToListAsync();
            
        var relatedEntityIds = relatedEdges
            .Select(e => e.FromEntityId == entityId ? e.ToEntityId : e.FromEntityId)
            .Distinct()
            .ToList();
            
        return relatedEntityIds;
    }

    public async Task<Dictionary<string, int>> GetEntityStatisticsAsync()
    {
        var stats = await _context.Entities
            .GroupBy(e => e.Type)
            .Select(g => new { Type = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Type, x => x.Count);
            
        return stats;
    }

    // Enhanced relationship discovery methods
    public async Task<List<Edge>> DiscoverCoOccurrenceRelationshipsAsync()
    {
        _logger.LogInformation("Discovering co-occurrence relationships");
        
        var newRelationships = new List<Edge>();
        
        // Find entities that appear in the same notes
        var notesWithEntities = await _context.Notes
            .Include(n => n.Classifications)
            .Where(n => n.Content.Length > 50) // Only substantial notes
            .Take(100) // Limit for performance
            .ToListAsync();

        foreach (var note in notesWithEntities)
        {
            var entitiesInNote = await _nerService.ExtractEntitiesAsync(note.Content);
            
            // Create relationships between entities in the same note
            for (int i = 0; i < entitiesInNote.Count; i++)
            {
                for (int j = i + 1; j < entitiesInNote.Count; j++)
                {
                    var entityA = entitiesInNote[i];
                    var entityB = entitiesInNote[j];
                    
                    // Skip if same entity or same type
                    if (entityA.Value == entityB.Value || entityA.Type == entityB.Type)
                        continue;
                    
                    var canonicalA = await _nerService.GetOrCreateCanonicalEntityAsync(entityA.Type, entityA.Value, entityA.Confidence);
                    var canonicalB = await _nerService.GetOrCreateCanonicalEntityAsync(entityB.Type, entityB.Value, entityB.Confidence);
                    
                    // Check if relationship already exists
                    var existingEdge = await _context.Edges
                        .FirstOrDefaultAsync(e => 
                            (e.FromEntityId == canonicalA.Id && e.ToEntityId == canonicalB.Id) ||
                            (e.FromEntityId == canonicalB.Id && e.ToEntityId == canonicalA.Id));
                    
                    if (existingEdge == null)
                    {
                        var newEdge = new Edge
                        {
                            FromEntityId = canonicalA.Id,
                            ToEntityId = canonicalB.Id,
                            RelationType = "co_occurrence",
                            Confidence = 0.7,
                            Source = "auto_discovery"
                        };
                        
                        newRelationships.Add(newEdge);
                    }
                }
            }
        }
        
        if (newRelationships.Any())
        {
            _context.Edges.AddRange(newRelationships);
            await _context.SaveChangesAsync();
            _logger.LogInformation("Created {Count} new co-occurrence relationships", newRelationships.Count);
        }
        
        return newRelationships;
    }

    public async Task<List<Edge>> DiscoverSemanticRelationshipsAsync()
    {
        _logger.LogInformation("Discovering semantic relationships using entity similarity");
        
        var newRelationships = new List<Edge>();
        var entities = await _context.Entities
            .Where(e => e.CanonicalEntityId == null) // Only canonical entities
            .Take(50) // Limit for performance
            .ToListAsync();

        // Group by type for more meaningful comparisons
        var entitiesByType = entities.GroupBy(e => e.Type).ToDictionary(g => g.Key, g => g.ToList());
        
        foreach (var typeGroup in entitiesByType)
        {
            var entitiesOfType = typeGroup.Value;
            
            for (int i = 0; i < entitiesOfType.Count; i++)
            {
                for (int j = i + 1; j < entitiesOfType.Count; j++)
                {
                    var entityA = entitiesOfType[i];
                    var entityB = entitiesOfType[j];
                    
                    // Calculate string similarity
                    var similarity = CalculateJaroWinklerSimilarity(entityA.Value, entityB.Value);
                    
                    // Create "similar" relationship if high similarity but not identical
                    if (similarity > 0.6 && similarity < 0.95)
                    {
                        var existingEdge = await _context.Edges
                            .FirstOrDefaultAsync(e => 
                                (e.FromEntityId == entityA.Id && e.ToEntityId == entityB.Id) ||
                                (e.FromEntityId == entityB.Id && e.ToEntityId == entityA.Id));
                        
                        if (existingEdge == null)
                        {
                            var newEdge = new Edge
                            {
                                FromEntityId = entityA.Id,
                                ToEntityId = entityB.Id,
                                RelationType = "similar",
                                Confidence = similarity,
                                Source = "semantic_analysis"
                            };
                            
                            newRelationships.Add(newEdge);
                        }
                    }
                }
            }
        }
        
        if (newRelationships.Any())
        {
            _context.Edges.AddRange(newRelationships);
            await _context.SaveChangesAsync();
            _logger.LogInformation("Created {Count} new semantic relationships", newRelationships.Count);
        }
        
        return newRelationships;
    }

    public async Task<List<Edge>> DiscoverTemporalRelationshipsAsync()
    {
        _logger.LogInformation("Discovering temporal relationships based on creation patterns");
        
        var newRelationships = new List<Edge>();
        
        // Find entities that frequently appear together in time windows
        var recentEntities = await _context.Entities
            .Where(e => e.CreatedAt >= DateTime.UtcNow.AddDays(-30))
            .OrderBy(e => e.CreatedAt)
            .ToListAsync();

        var timeWindows = recentEntities
            .GroupBy(e => new { 
                Day = e.CreatedAt.Date,
                Hour = e.CreatedAt.Hour
            })
            .Where(g => g.Count() > 1)
            .ToList();

        foreach (var window in timeWindows)
        {
            var entitiesInWindow = window.ToList();
            
            for (int i = 0; i < entitiesInWindow.Count; i++)
            {
                for (int j = i + 1; j < entitiesInWindow.Count; j++)
                {
                    var entityA = entitiesInWindow[i];
                    var entityB = entitiesInWindow[j];
                    
                    if (entityA.Type != entityB.Type) // Different types more interesting
                    {
                        var existingEdge = await _context.Edges
                            .FirstOrDefaultAsync(e => 
                                (e.FromEntityId == entityA.Id && e.ToEntityId == entityB.Id) ||
                                (e.FromEntityId == entityB.Id && e.ToEntityId == entityA.Id));
                        
                        if (existingEdge == null)
                        {
                            var newEdge = new Edge
                            {
                                FromEntityId = entityA.Id,
                                ToEntityId = entityB.Id,
                                RelationType = "temporal_proximity",
                                Confidence = 0.5,
                                Source = "temporal_analysis"
                            };
                            
                            newRelationships.Add(newEdge);
                        }
                    }
                }
            }
        }
        
        if (newRelationships.Any())
        {
            _context.Edges.AddRange(newRelationships);
            await _context.SaveChangesAsync();
            _logger.LogInformation("Created {Count} new temporal relationships", newRelationships.Count);
        }
        
        return newRelationships;
    }

    public async Task<GraphInsights> AnalyzeGraphStructureAsync()
    {
        _logger.LogInformation("Analyzing graph structure for insights");
        
        var totalEntities = await _context.Entities.CountAsync();
        var totalEdges = await _context.Edges.CountAsync();
        
        // Find most connected entities (hubs)
        var entityConnections = await _context.Edges
            .GroupBy(e => e.FromEntityId)
            .Select(g => new { EntityId = g.Key, OutDegree = g.Count() })
            .Union(
                _context.Edges
                    .GroupBy(e => e.ToEntityId)
                    .Select(g => new { EntityId = g.Key, OutDegree = g.Count() })
            )
            .GroupBy(x => x.EntityId)
            .Select(g => new { EntityId = g.Key, TotalDegree = g.Sum(x => x.OutDegree) })
            .OrderByDescending(x => x.TotalDegree)
            .Take(10)
            .ToListAsync();

        var hubEntities = new List<GraphHub>();
        foreach (var connection in entityConnections)
        {
            var entity = await _context.Entities.FindAsync(connection.EntityId);
            if (entity != null)
            {
                hubEntities.Add(new GraphHub
                {
                    EntityId = entity.Id,
                    EntityLabel = entity.Value,
                    EntityType = entity.Type,
                    ConnectionCount = connection.TotalDegree
                });
            }
        }
        
        // Find isolated entities
        var connectedEntityIds = await _context.Edges
            .SelectMany(e => new[] { e.FromEntityId, e.ToEntityId })
            .Distinct()
            .ToListAsync();
        
        var isolatedCount = await _context.Entities
            .Where(e => !connectedEntityIds.Contains(e.Id))
            .CountAsync();

        // Relationship type distribution
        var relationshipTypes = await _context.Edges
            .GroupBy(e => e.RelationType)
            .Select(g => new { Type = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ToDictionaryAsync(x => x.Type, x => x.Count);

        return new GraphInsights
        {
            TotalEntities = totalEntities,
            TotalRelationships = totalEdges,
            ConnectedEntities = totalEntities - isolatedCount,
            IsolatedEntities = isolatedCount,
            TopHubs = hubEntities,
            RelationshipTypeDistribution = relationshipTypes,
            GraphDensity = totalEntities > 1 ? (double)totalEdges / (totalEntities * (totalEntities - 1) / 2) : 0,
            GeneratedAt = DateTime.UtcNow
        };
    }

    private double CalculateJaroWinklerSimilarity(string s1, string s2)
    {
        // Simple Jaro-Winkler implementation - you might want to use a proper library
        if (string.IsNullOrEmpty(s1) || string.IsNullOrEmpty(s2))
            return 0;
        
        if (s1 == s2)
            return 1;
        
        // Very basic similarity - enhance with proper Jaro-Winkler algorithm
        var longer = s1.Length > s2.Length ? s1 : s2;
        var shorter = s1.Length > s2.Length ? s2 : s1;
        
        if (longer.Length == 0)
            return 1;
        
        var editDistance = ComputeLevenshteinDistance(s1, s2);
        return (longer.Length - editDistance) / (double)longer.Length;
    }

    private int ComputeLevenshteinDistance(string s1, string s2)
    {
        var n = s1.Length;
        var m = s2.Length;
        var d = new int[n + 1, m + 1];

        for (var i = 0; i <= n; d[i, 0] = i++) { }
        for (var j = 0; j <= m; d[0, j] = j++) { }

        for (var i = 1; i <= n; i++)
        {
            for (var j = 1; j <= m; j++)
            {
                var cost = (s2[j - 1] == s1[i - 1]) ? 0 : 1;
                d[i, j] = Math.Min(Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1), d[i - 1, j - 1] + cost);
            }
        }

        return d[n, m];
    }

    public async Task CleanupUserEntitiesAsync(string userId)
    {
        _logger.LogInformation("Cleaning up graph entities for user: {UserId}", userId);

        try
        {
            // Find all entities and edges created by this user by looking at note references
            var userNoteIds = await _context.Notes
                .Where(n => n.UserId == userId)
                .Select(n => n.Id)
                .ToListAsync();

            if (userNoteIds.Any())
            {
                var noteIdsString = string.Join("','", userNoteIds);

                // Delete edges referencing user's notes
                await _context.Database.ExecuteSqlRawAsync(
                    "DELETE FROM edges WHERE source_id IN (SELECT id FROM entities WHERE note_ids LIKE '%{0}%') OR target_id IN (SELECT id FROM entities WHERE note_ids LIKE '%{0}%')",
                    string.Join("%' OR note_ids LIKE '%", userNoteIds));

                // Delete entities referencing user's notes  
                await _context.Database.ExecuteSqlRawAsync(
                    "DELETE FROM entities WHERE note_ids LIKE '%{0}%'",
                    string.Join("%' OR note_ids LIKE '%", userNoteIds));

                _logger.LogInformation("Deleted graph entities and edges for {Count} notes belonging to user {UserId}", userNoteIds.Count, userId);
            }
            else
            {
                _logger.LogInformation("No notes found for user {UserId}, no graph cleanup needed", userId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cleanup graph entities for user {UserId}", userId);
            throw;
        }
    }

    public async Task CleanupNoteEntitiesAsync(string noteId)
    {
        try
        {
            _logger.LogInformation("Cleaning up graph entities for note {NoteId}", noteId);

            // Delete edges referencing this note's entities
            await _context.Database.ExecuteSqlRawAsync(
                "DELETE FROM edges WHERE source_id IN (SELECT id FROM entities WHERE note_ids LIKE '%{0}%') OR target_id IN (SELECT id FROM entities WHERE note_ids LIKE '%{0}%')",
                noteId);

            // Delete entities referencing this note  
            await _context.Database.ExecuteSqlRawAsync(
                "DELETE FROM entities WHERE note_ids LIKE '%{0}%'",
                noteId);

            _logger.LogInformation("Cleaned up graph entities for note {NoteId}", noteId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cleanup graph entities for note {NoteId}", noteId);
            throw;
        }
    }

    public async Task<GraphRebuildResult> RebuildGraphAsync()
    {
        _logger.LogInformation("Starting complete graph rebuild");
        var result = new GraphRebuildResult();
        
        try
        {
            // Clear existing graph data
            _logger.LogInformation("Clearing existing graph data");
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM Edges");
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM Entities");
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM TextSpans WHERE EntityId IS NOT NULL");
            
            result.ClearedEntities = true;
            
            // Get all notes for the current user
            var notes = await _context.Notes
                .Where(n => n.Content.Length > 50) // Only substantial notes
                .OrderBy(n => n.CreatedAt)
                .ToListAsync();
            
            result.ProcessedNotes = notes.Count;
            _logger.LogInformation("Processing {Count} notes for graph reconstruction", notes.Count);
            
            var totalEntities = 0;
            var totalRelations = 0;
            
            // Process each note
            foreach (var note in notes)
            {
                try
                {
                    // Extract entities from note content
                    var extractions = await _nerService.ExtractEntitiesAsync(note.Content);
                    
                    if (extractions.Any())
                    {
                        // Get or create canonical entities
                        var canonicalEntities = new List<Entity>();
                        foreach (var extraction in extractions)
                        {
                            var entity = await _nerService.GetOrCreateCanonicalEntityAsync(
                                extraction.Type, 
                                extraction.Value, 
                                extraction.Confidence);
                            canonicalEntities.Add(entity);
                        }
                        
                        totalEntities += canonicalEntities.Count;
                        
                        // Create relationships between entities in the same note
                        if (canonicalEntities.Count > 1)
                        {
                            var relations = await CreateEntityRelationsAsync(canonicalEntities.Distinct().ToList(), note.Id);
                            totalRelations += relations.Count;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to process note {NoteId} during graph rebuild", note.Id);
                    result.FailedNotes++;
                }
            }
            
            // Run discovery algorithms
            _logger.LogInformation("Running relationship discovery algorithms");
            var coOccurrenceTask = DiscoverCoOccurrenceRelationshipsAsync();
            var semanticTask = DiscoverSemanticRelationshipsAsync();
            var temporalTask = DiscoverTemporalRelationshipsAsync();
            
            await Task.WhenAll(coOccurrenceTask, semanticTask, temporalTask);
            
            totalRelations += coOccurrenceTask.Result.Count + semanticTask.Result.Count + temporalTask.Result.Count;
            
            result.TotalEntities = totalEntities;
            result.TotalRelations = totalRelations;
            result.Success = true;
            result.CompletedAt = DateTime.UtcNow;
            
            _logger.LogInformation("Graph rebuild completed successfully. Entities: {Entities}, Relations: {Relations}", 
                totalEntities, totalRelations);
                
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to rebuild graph");
            result.Success = false;
            result.ErrorMessage = ex.Message;
            return result;
        }
    }

    public async Task<bool> LinkEntitiesAsync(string fromEntityId, string toEntityId, string relationType, double confidence = 0.8)
    {
        try
        {
            // Check if entities exist
            var fromEntity = await _context.Entities.FindAsync(fromEntityId);
            var toEntity = await _context.Entities.FindAsync(toEntityId);
            
            if (fromEntity == null || toEntity == null)
            {
                _logger.LogWarning("Cannot link entities - one or both entities not found: {FromId}, {ToId}", 
                    fromEntityId, toEntityId);
                return false;
            }
            
            // Check if link already exists
            var existingEdge = await _context.Edges
                .FirstOrDefaultAsync(e => 
                    (e.FromEntityId == fromEntityId && e.ToEntityId == toEntityId) ||
                    (e.FromEntityId == toEntityId && e.ToEntityId == fromEntityId));
                    
            if (existingEdge != null)
            {
                _logger.LogInformation("Link already exists between entities {FromId} and {ToId}", 
                    fromEntityId, toEntityId);
                return false;
            }
            
            // Create new edge
            var newEdge = new Edge
            {
                FromEntityId = fromEntityId,
                ToEntityId = toEntityId,
                RelationType = relationType,
                Confidence = confidence,
                Source = "manual_link",
                CreatedAt = DateTime.UtcNow
            };
            
            _context.Edges.Add(newEdge);
            await _context.SaveChangesAsync();
            
            _logger.LogInformation("Successfully linked entities {FromId} and {ToId} with relation {RelationType}", 
                fromEntityId, toEntityId, relationType);
                
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to link entities {FromId} and {ToId}", fromEntityId, toEntityId);
            return false;
        }
    }

    public async Task<bool> UnlinkEntitiesAsync(string fromEntityId, string toEntityId)
    {
        try
        {
            var edge = await _context.Edges
                .FirstOrDefaultAsync(e => 
                    (e.FromEntityId == fromEntityId && e.ToEntityId == toEntityId) ||
                    (e.FromEntityId == toEntityId && e.ToEntityId == fromEntityId));
                    
            if (edge == null)
            {
                _logger.LogWarning("No link found between entities {FromId} and {ToId}", fromEntityId, toEntityId);
                return false;
            }
            
            _context.Edges.Remove(edge);
            await _context.SaveChangesAsync();
            
            _logger.LogInformation("Successfully unlinked entities {FromId} and {ToId}", fromEntityId, toEntityId);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to unlink entities {FromId} and {ToId}", fromEntityId, toEntityId);
            return false;
        }
    }

    public async Task<List<GraphNode>> GetNotesForEntityAsync(string entityId)
    {
        try
        {
            // Find all text spans that reference this entity
            var textSpans = await _context.TextSpans
                .Where(ts => ts.EntityId == entityId)
                .Include(ts => ts.Note)
                .Select(ts => ts.Note)
                .Distinct()
                .ToListAsync();
            
            var notes = textSpans.Where(n => n != null).Select(note => new GraphNode
            {
                Id = note!.Id,
                Type = "note",
                Value = note.Title,
                ConnectionCount = 0, // Will be populated if needed
                LastSeen = note.UpdatedAt
            }).ToList();
            
            return notes;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get notes for entity {EntityId}", entityId);
            return new List<GraphNode>();
        }
    }

    public async Task<List<GraphSuggestion>> GetConnectionSuggestionsAsync(string entityId, int maxSuggestions = 5)
    {
        try
        {
            var suggestions = new List<GraphSuggestion>();
            
            // Get the source entity
            var sourceEntity = await _context.Entities.FindAsync(entityId);
            if (sourceEntity == null) return suggestions;
            
            // Find entities that appear in similar contexts but aren't connected
            var sourceNotes = await _context.TextSpans
                .Where(ts => ts.EntityId == entityId)
                .Select(ts => ts.NoteId)
                .Distinct()
                .ToListAsync();
            
            // Find other entities in the same notes
            var coOccurringEntities = await _context.TextSpans
                .Where(ts => sourceNotes.Contains(ts.NoteId) && ts.EntityId != entityId && ts.EntityId != null)
                .GroupBy(ts => ts.EntityId)
                .Select(g => new { EntityId = g.Key, Count = g.Count() })
                .OrderByDescending(x => x.Count)
                .Take(maxSuggestions * 2) // Get more candidates
                .ToListAsync();
            
            // Check which ones aren't already connected
            var existingConnections = await _context.Edges
                .Where(e => (e.FromEntityId == entityId && coOccurringEntities.Select(x => x.EntityId).Contains(e.ToEntityId)) ||
                           (e.ToEntityId == entityId && coOccurringEntities.Select(x => x.EntityId).Contains(e.FromEntityId)))
                .Select(e => e.FromEntityId == entityId ? e.ToEntityId : e.FromEntityId)
                .ToListAsync();
            
            var candidateEntityIds = coOccurringEntities
                .Where(x => !existingConnections.Contains(x.EntityId))
                .Take(maxSuggestions)
                .ToList();
            
            foreach (var candidate in candidateEntityIds)
            {
                var targetEntity = await _context.Entities.FindAsync(candidate.EntityId);
                if (targetEntity == null) continue;
                
                // Determine suggested relationship type based on entity types
                var relationType = DetermineSuggestedRelationType(sourceEntity.Type, targetEntity.Type);
                
                // Calculate confidence based on co-occurrence frequency
                var confidence = Math.Min(0.9, (double)candidate.Count / Math.Max(1, sourceNotes.Count));
                
                suggestions.Add(new GraphSuggestion
                {
                    FromEntityId = sourceEntity.Id,
                    FromEntityName = sourceEntity.CanonicalValue,
                    FromEntityType = sourceEntity.Type,
                    ToEntityId = targetEntity.Id,
                    ToEntityName = targetEntity.CanonicalValue,
                    ToEntityType = targetEntity.Type,
                    SuggestedRelationType = relationType,
                    Confidence = confidence,
                    Reason = $"Appears together in {candidate.Count} note(s)",
                    SupportingNotes = sourceNotes.Take(3).ToList() // Show up to 3 supporting notes
                });
            }
            
            return suggestions.OrderByDescending(s => s.Confidence).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get connection suggestions for entity {EntityId}", entityId);
            return new List<GraphSuggestion>();
        }
    }

    public async Task<List<GraphSuggestion>> GetGlobalSuggestionsAsync(int maxSuggestions = 10)
    {
        try
        {
            var suggestions = new List<GraphSuggestion>();
            
            // Find entities that frequently co-occur but aren't connected
            var coOccurrences = await _context.Database
                .SqlQueryRaw<EntityCoOccurrence>(@"
                    SELECT 
                        ts1.EntityId as EntityId1,
                        ts2.EntityId as EntityId2,
                        COUNT(DISTINCT ts1.NoteId) as CoOccurrenceCount
                    FROM TextSpans ts1
                    JOIN TextSpans ts2 ON ts1.NoteId = ts2.NoteId 
                    WHERE ts1.EntityId IS NOT NULL 
                        AND ts2.EntityId IS NOT NULL 
                        AND ts1.EntityId < ts2.EntityId
                        AND NOT EXISTS (
                            SELECT 1 FROM Edges e 
                            WHERE (e.FromEntityId = ts1.EntityId AND e.ToEntityId = ts2.EntityId)
                               OR (e.FromEntityId = ts2.EntityId AND e.ToEntityId = ts1.EntityId)
                        )
                    GROUP BY ts1.EntityId, ts2.EntityId
                    HAVING COUNT(DISTINCT ts1.NoteId) >= 2
                    ORDER BY CoOccurrenceCount DESC
                    LIMIT {0}", maxSuggestions)
                .ToListAsync();
            
            foreach (var coOccurrence in coOccurrences)
            {
                var entity1 = await _context.Entities.FindAsync(coOccurrence.EntityId1);
                var entity2 = await _context.Entities.FindAsync(coOccurrence.EntityId2);
                
                if (entity1 == null || entity2 == null) continue;
                
                var relationType = DetermineSuggestedRelationType(entity1.Type, entity2.Type);
                var confidence = Math.Min(0.95, (double)coOccurrence.CoOccurrenceCount / 10.0);
                
                suggestions.Add(new GraphSuggestion
                {
                    FromEntityId = entity1.Id,
                    FromEntityName = entity1.CanonicalValue,
                    FromEntityType = entity1.Type,
                    ToEntityId = entity2.Id,
                    ToEntityName = entity2.CanonicalValue,
                    ToEntityType = entity2.Type,
                    SuggestedRelationType = relationType,
                    Confidence = confidence,
                    Reason = $"Co-occur in {coOccurrence.CoOccurrenceCount} note(s)",
                    SupportingNotes = new List<string>()
                });
            }
            
            return suggestions.OrderByDescending(s => s.Confidence).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get global suggestions");
            return new List<GraphSuggestion>();
        }
    }

    private string DetermineSuggestedRelationType(string fromType, string toType)
    {
        // Smart relationship type suggestions based on entity types
        return (fromType.ToLower(), toType.ToLower()) switch
        {
            ("person", "organization") => "works_for",
            ("organization", "person") => "employs",
            ("person", "person") => "knows",
            ("person", "location") => "located_in",
            ("organization", "location") => "based_in",
            ("concept", "concept") => "related_to",
            ("technology", "technology") => "depends_on",
            ("project", "person") => "involves",
            ("project", "technology") => "uses",
            ("document", _) => "mentions",
            (_, "document") => "mentioned_in",
            _ => "related_to"
        };
    }

    public void Dispose()
    {
        _neo4jDriver?.Dispose();
    }
}

// Helper class for raw SQL query
public class EntityCoOccurrence
{
    public string EntityId1 { get; set; } = string.Empty;
    public string EntityId2 { get; set; } = string.Empty;
    public int CoOccurrenceCount { get; set; }
}
