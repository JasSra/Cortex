using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SecurityController : ControllerBase
{
    private readonly IAuditService _auditService;
    private readonly ILogger<SecurityController> _logger;
    private readonly IUserContextAccessor _userContext;

    public SecurityController(
        IAuditService auditService,
        ILogger<SecurityController> logger,
        IUserContextAccessor userContext)
    {
        _auditService = auditService;
        _logger = logger;
        _userContext = userContext;
    }

    /// <summary>
    /// Get audit trail for date range
    /// </summary>
    [HttpGet("audit")]
    public async Task<ActionResult<List<AuditEntry>>> GetAuditTrail(
        [FromQuery] DateTime fromDate,
        [FromQuery] DateTime toDate,
        [FromQuery] string? userId = null)
    {
        try
        {
            // Only allow admins to view other users' audit logs
            if (!string.IsNullOrEmpty(userId) && userId != _userContext.UserId)
            {
                if (!Rbac.RequireRole(_userContext, "Admin"))
                {
                    return StatusCode(403, new { error = "Only administrators can view other users' audit logs" });
                }
            }

            _logger.LogInformation("Retrieving audit trail from {FromDate} to {ToDate} for user {RequestingUserId}", 
                fromDate, toDate, _userContext.UserId);

            var auditEntries = await _auditService.GetAuditTrailAsync(fromDate, toDate, userId);
            
            // Log this audit access
            await _auditService.LogActionAsync("view_audit_trail", "audit_log", 
                $"{fromDate:yyyy-MM-dd}_{toDate:yyyy-MM-dd}", new { targetUserId = userId });

            return Ok(auditEntries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving audit trail for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to retrieve audit trail" });
        }
    }

    /// <summary>
    /// Get audit summary statistics
    /// </summary>
    [HttpGet("audit/summary")]
    public async Task<ActionResult<AuditSummary>> GetAuditSummary(
        [FromQuery] DateTime fromDate,
        [FromQuery] DateTime toDate)
    {
        try
        {
            _logger.LogInformation("Generating audit summary from {FromDate} to {ToDate} for user {UserId}", 
                fromDate, toDate, _userContext.UserId);

            var summary = await _auditService.GetAuditSummaryAsync(fromDate, toDate);
            
            // Log this audit summary access
            await _auditService.LogActionAsync("view_audit_summary", "audit_summary", 
                $"{fromDate:yyyy-MM-dd}_{toDate:yyyy-MM-dd}");

            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating audit summary for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to generate audit summary" });
        }
    }

    /// <summary>
    /// Get current user's recent activity
    /// </summary>
    [HttpGet("my-activity")]
    public async Task<ActionResult<List<AuditEntry>>> GetMyRecentActivity(
        [FromQuery] int days = 7)
    {
        try
        {
            var fromDate = DateTime.UtcNow.AddDays(-days);
            var toDate = DateTime.UtcNow;

            _logger.LogInformation("Retrieving recent activity for user {UserId} (last {Days} days)", 
                _userContext.UserId, days);

            var auditEntries = await _auditService.GetAuditTrailAsync(fromDate, toDate, _userContext.UserId);

            return Ok(auditEntries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving recent activity for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to retrieve recent activity" });
        }
    }

    /// <summary>
    /// Check system security health
    /// </summary>
    [HttpGet("health")]
    public async Task<ActionResult> GetSecurityHealth()
    {
        try
        {
            _logger.LogInformation("Checking security health for user {UserId}", _userContext.UserId);

            var last24Hours = DateTime.UtcNow.AddDays(-1);
            var summary = await _auditService.GetAuditSummaryAsync(last24Hours, DateTime.UtcNow);

            var health = new
            {
                status = "healthy",
                auditingActive = true,
                last24HourActions = summary.TotalActions,
                sensitiveOperations = summary.SensitiveOperations,
                uniqueActiveUsers = summary.UniqueUsers,
                topActions = summary.ActionBreakdown
                    .OrderByDescending(kvp => kvp.Value)
                    .Take(5)
                    .ToDictionary(kvp => kvp.Key, kvp => kvp.Value),
                checkTime = DateTime.UtcNow
            };

            // Log security health check
            await _auditService.LogActionAsync("security_health_check", "security_system", "health");

            return Ok(health);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking security health for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { status = "error", message = "Error checking security health" });
        }
    }

    /// <summary>
    /// Get data classification report
    /// </summary>
    [HttpGet("classification-report")]
    public async Task<ActionResult> GetDataClassificationReport()
    {
        try
        {
            _logger.LogInformation("Generating data classification report for user {UserId}", _userContext.UserId);

            // This would integrate with your existing ClassificationService
            // For now, return a placeholder structure
            var report = new
            {
                totalItems = 0,
                byClassification = new Dictionary<string, int>
                {
                    { "public", 0 },
                    { "internal", 0 },
                    { "confidential", 0 },
                    { "restricted", 0 }
                },
                sensitiveDataDetected = 0,
                unclassifiedItems = 0,
                lastUpdated = DateTime.UtcNow
            };

            // Log classification report access
            await _auditService.LogActionAsync("view_classification_report", "classification_report", "system");

            return Ok(report);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating classification report for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to generate classification report" });
        }
    }
}
