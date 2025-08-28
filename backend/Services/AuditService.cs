using Microsoft.EntityFrameworkCore;
using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Security;
using System.Text.Json;

namespace CortexApi.Services;

public interface IAuditService
{
    Task LogActionAsync(string action, string resourceType, string resourceId, object? details = null);
    Task LogSearchAsync(string query, string searchType, int resultsCount);
    Task LogExportAsync(string scope, string format, int itemCount);
    Task LogSensitiveAccessAsync(string resourceType, string resourceId, string operation);
    Task<List<AuditEntry>> GetAuditTrailAsync(DateTime fromDate, DateTime toDate, string? userId = null);
    Task<AuditSummary> GetAuditSummaryAsync(DateTime fromDate, DateTime toDate);
}

public class AuditService : IAuditService
{
    private readonly CortexDbContext _context;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<AuditService> _logger;

    public AuditService(
        CortexDbContext context,
        IUserContextAccessor userContext,
        ILogger<AuditService> logger)
    {
        _context = context;
        _userContext = userContext;
        _logger = logger;
    }

    public async Task LogActionAsync(string action, string resourceType, string resourceId, object? details = null)
    {
        try
        {
            var auditEntry = new AuditEntry
            {
                UserId = _userContext.UserId ?? "system",
                Action = action,
                ResourceType = resourceType,
                ResourceId = resourceId,
                Details = details != null ? JsonSerializer.Serialize(details) : null,
                IpAddress = "unknown", // TODO: Get from HttpContext if needed
                UserAgent = "unknown", // TODO: Get from HttpContext if needed
                Timestamp = DateTime.UtcNow
            };

            _context.AuditEntries.Add(auditEntry);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Audit: User {UserId} performed {Action} on {ResourceType}:{ResourceId}",
                auditEntry.UserId, action, resourceType, resourceId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to log audit entry for action {Action}", action);
        }
    }

    public async Task LogSearchAsync(string query, string searchType, int resultsCount)
    {
        var details = new
        {
            query,
            searchType,
            resultsCount,
            searchedAt = DateTime.UtcNow
        };

        await LogActionAsync("search", "search_query", query.GetHashCode().ToString(), details);
    }

    public async Task LogExportAsync(string scope, string format, int itemCount)
    {
        var details = new
        {
            scope,
            format,
            itemCount,
            exportedAt = DateTime.UtcNow
        };

        await LogActionAsync("export", "data_export", $"{scope}_{format}", details);
    }

    public async Task LogSensitiveAccessAsync(string resourceType, string resourceId, string operation)
    {
        var details = new
        {
            operation,
            sensitiveAccess = true,
            accessedAt = DateTime.UtcNow
        };

        await LogActionAsync($"sensitive_{operation}", resourceType, resourceId, details);
        
        // Additional logging for sensitive operations
        _logger.LogWarning("SENSITIVE ACCESS: User {UserId} performed {Operation} on {ResourceType}:{ResourceId}",
            _userContext.UserId, operation, resourceType, resourceId);
    }

    public async Task<List<AuditEntry>> GetAuditTrailAsync(DateTime fromDate, DateTime toDate, string? userId = null)
    {
        var query = _context.AuditEntries
            .Where(a => a.Timestamp >= fromDate && a.Timestamp <= toDate);

        if (!string.IsNullOrEmpty(userId))
        {
            query = query.Where(a => a.UserId == userId);
        }

        return await query
            .OrderByDescending(a => a.Timestamp)
            .Take(1000) // Limit for performance
            .ToListAsync();
    }

    public async Task<AuditSummary> GetAuditSummaryAsync(DateTime fromDate, DateTime toDate)
    {
        var auditEntries = await _context.AuditEntries
            .Where(a => a.Timestamp >= fromDate && a.Timestamp <= toDate)
            .ToListAsync();

        var summary = new AuditSummary
        {
            FromDate = fromDate,
            ToDate = toDate,
            TotalActions = auditEntries.Count,
            UniqueUsers = auditEntries.Select(a => a.UserId).Distinct().Count(),
            ActionBreakdown = auditEntries
                .GroupBy(a => a.Action)
                .ToDictionary(g => g.Key, g => g.Count()),
            ResourceTypeBreakdown = auditEntries
                .GroupBy(a => a.ResourceType)
                .ToDictionary(g => g.Key, g => g.Count()),
            SensitiveOperations = auditEntries
                .Where(a => a.Action.StartsWith("sensitive_"))
                .Count(),
            TopUsers = auditEntries
                .GroupBy(a => a.UserId)
                .OrderByDescending(g => g.Count())
                .Take(10)
                .Select(g => new UserActivity { UserId = g.Key, ActionCount = g.Count() })
                .ToList(),
            GeneratedAt = DateTime.UtcNow
        };

        return summary;
    }
}
