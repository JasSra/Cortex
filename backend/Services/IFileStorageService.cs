using CortexApi.Models;
using Microsoft.AspNetCore.Http;

namespace CortexApi.Services;

/// <summary>
/// Abstraction for file storage operations to eliminate code duplication
/// between IngestController and StorageController
/// </summary>
public interface IFileStorageService
{
    /// <summary>
    /// Store a file and create a StoredFile record
    /// </summary>
    Task<StoredFile> StoreFileAsync(IFormFile file, CancellationToken ct = default);
    
    /// <summary>
    /// Delete a stored file both from disk and database
    /// </summary>
    Task<bool> DeleteStoredFileAsync(string fileId, CancellationToken ct = default);
    
    /// <summary>
    /// Get a stored file by ID
    /// </summary>
    Task<StoredFile?> GetStoredFileAsync(string fileId, CancellationToken ct = default);
    
    /// <summary>
    /// Get stored files for a user with pagination
    /// </summary>
    Task<(int total, List<StoredFile> items)> GetUserStoredFilesAsync(string userId, int limit = 50, int offset = 0, CancellationToken ct = default);
    
    /// <summary>
    /// Generate tags for a file using AI or heuristics
    /// </summary>
    Task<List<string>> GenerateFileTagsAsync(string fileName, string extension, long sizeBytes, CancellationToken ct = default);
}
