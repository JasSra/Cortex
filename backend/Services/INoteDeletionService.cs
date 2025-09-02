using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Security;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Services;

/// <summary>
/// Service responsible for safely deleting notes and all related data
/// </summary>
public interface INoteDeletionService
{
    /// <summary>
    /// Delete a note and all its related data (chunks, embeddings, graph entities, stored files)
    /// </summary>
    Task<bool> DeleteNoteAsync(string noteId, CancellationToken ct = default);
    
    /// <summary>
    /// Get information about what will be deleted before actually deleting
    /// </summary>
    Task<NoteDeletionPlan> GetDeletionPlanAsync(string noteId, CancellationToken ct = default);
}

public class NoteDeletionService : INoteDeletionService
{
    private readonly CortexDbContext _db;
    private readonly IUserContextAccessor _user;
    private readonly ILogger<NoteDeletionService> _logger;
    private readonly IGraphService _graphService;
    private readonly IFileStorageService _fileStorageService;

    public NoteDeletionService(
        CortexDbContext db, 
        IUserContextAccessor user, 
        ILogger<NoteDeletionService> logger, 
        IGraphService graphService,
        IFileStorageService fileStorageService)
    {
        _db = db;
        _user = user;
        _logger = logger;
        _graphService = graphService;
        _fileStorageService = fileStorageService;
    }

    public async Task<NoteDeletionPlan> GetDeletionPlanAsync(string noteId, CancellationToken ct = default)
    {
        var note = await _db.Notes
            .Include(n => n.Chunks)
            .FirstOrDefaultAsync(n => n.Id == noteId && n.UserId == _user.UserId, ct);

        if (note == null)
        {
            return new NoteDeletionPlan { Found = false };
        }

        var embeddingCount = await _db.Embeddings
            .Where(e => e.Chunk.NoteId == noteId)
            .CountAsync(ct);

        var entityCount = await _db.TextSpans
            .Where(ts => ts.NoteId == noteId && ts.EntityId != null)
            .Select(ts => ts.EntityId)
            .Distinct()
            .CountAsync(ct);

        var edgeCount = await _db.Edges
            .Where(e => _db.TextSpans
                .Where(ts => ts.NoteId == noteId && ts.EntityId != null)
                .Select(ts => ts.EntityId)
                .Contains(e.FromEntityId) ||
                _db.TextSpans
                .Where(ts => ts.NoteId == noteId && ts.EntityId != null)
                .Select(ts => ts.EntityId)
                .Contains(e.ToEntityId))
            .CountAsync(ct);

        return new NoteDeletionPlan
        {
            Found = true,
            NoteTitle = note.Title,
            ChunkCount = note.ChunkCount,
            EmbeddingCount = embeddingCount,
            EntityCount = entityCount,
            EdgeCount = edgeCount,
            HasStoredFile = !string.IsNullOrEmpty(note.StoredFileId),
            StoredFileId = note.StoredFileId
        };
    }

    public async Task<bool> DeleteNoteAsync(string noteId, CancellationToken ct = default)
    {
        using var transaction = await _db.Database.BeginTransactionAsync(ct);
        
        try
        {
            var note = await _db.Notes
                .Include(n => n.Chunks)
                .ThenInclude(c => c.Embeddings)
                .Include(n => n.Classifications)
                .Include(n => n.NoteTags)
                .FirstOrDefaultAsync(n => n.Id == noteId && n.UserId == _user.UserId, ct);

            if (note == null)
            {
                _logger.LogWarning("Note {NoteId} not found for user {UserId}", noteId, _user.UserId);
                return false;
            }

            _logger.LogInformation("Starting deletion of note {NoteId} ({Title}) for user {UserId}", 
                noteId, note.Title, _user.UserId);

            // 1. Delete embeddings
            foreach (var chunk in note.Chunks)
            {
                if (chunk.Embeddings.Any())
                {
                    _db.Embeddings.RemoveRange(chunk.Embeddings);
                    _logger.LogDebug("Deleting {Count} embeddings for chunk {ChunkId}", 
                        chunk.Embeddings.Count, chunk.Id);
                }
            }

            // 2. Delete chunks
            if (note.Chunks.Any())
            {
                _db.NoteChunks.RemoveRange(note.Chunks);
                _logger.LogDebug("Deleting {Count} chunks for note {NoteId}", 
                    note.Chunks.Count, noteId);
            }

            // 3. Delete classifications
            if (note.Classifications.Any())
            {
                _db.Classifications.RemoveRange(note.Classifications);
                _logger.LogDebug("Deleting {Count} classifications for note {NoteId}", 
                    note.Classifications.Count, noteId);
            }

            // 4. Delete note tags
            if (note.NoteTags.Any())
            {
                _db.NoteTags.RemoveRange(note.NoteTags);
                _logger.LogDebug("Deleting {Count} note tags for note {NoteId}", 
                    note.NoteTags.Count, noteId);
            }

            // 5. Delete graph entities and edges (outside transaction due to raw SQL)
            await transaction.CommitAsync(ct);
            
            try
            {
                await _graphService.CleanupNoteEntitiesAsync(noteId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to cleanup graph entities for note {NoteId}, continuing with deletion", noteId);
            }

            // Start new transaction for the final steps
            using var finalTransaction = await _db.Database.BeginTransactionAsync(ct);

            // 6. Delete stored file if linked
            if (!string.IsNullOrEmpty(note.StoredFileId))
            {
                try
                {
                    var success = await _fileStorageService.DeleteStoredFileAsync(note.StoredFileId, ct);
                    if (success)
                    {
                        _logger.LogInformation("Deleted stored file {FileId} for note {NoteId}", 
                            note.StoredFileId, noteId);
                    }
                    else
                    {
                        _logger.LogWarning("Failed to delete stored file {FileId} for note {NoteId}", 
                            note.StoredFileId, noteId);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error deleting stored file {FileId} for note {NoteId}", 
                        note.StoredFileId, noteId);
                }
            }

            // 7. Delete the note itself
            _db.Notes.Remove(note);
            await _db.SaveChangesAsync(ct);
            await finalTransaction.CommitAsync(ct);

            _logger.LogInformation("Successfully deleted note {NoteId} ({Title}) and all related data for user {UserId}", 
                noteId, note.Title, _user.UserId);

            return true;
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(ct);
            _logger.LogError(ex, "Failed to delete note {NoteId} for user {UserId}", noteId, _user.UserId);
            throw;
        }
    }
}

public class NoteDeletionPlan
{
    public bool Found { get; set; }
    public string NoteTitle { get; set; } = string.Empty;
    public int ChunkCount { get; set; }
    public int EmbeddingCount { get; set; }
    public int EntityCount { get; set; }
    public int EdgeCount { get; set; }
    public bool HasStoredFile { get; set; }
    public string? StoredFileId { get; set; }
}
