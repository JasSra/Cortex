using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Security;
using CortexApi.Services;

namespace CortexApi.Controllers;

/// <summary>
/// Notification management operations
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly CortexDbContext _context;
    private readonly IUserContextAccessor _userContext;
    private readonly INotificationService _notificationService;
    private readonly ILogger<NotificationsController> _logger;

    public NotificationsController(
        CortexDbContext context,
        IUserContextAccessor userContext,
        INotificationService notificationService,
        ILogger<NotificationsController> logger)
    {
        _context = context;
        _userContext = userContext;
        _notificationService = notificationService;
        _logger = logger;
    }

    /// <summary>
    /// Register a device for push notifications
    /// </summary>
    [HttpPost("register-device")]
    [ProducesResponseType(typeof(DeviceRegistrationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> RegisterDevice([FromBody] DeviceRegistrationRequest request)
    {
        try
        {
            var subjectId = _userContext.UserSubjectId;
            if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

            if (string.IsNullOrWhiteSpace(request.Endpoint))
                return BadRequest(new { message = "Endpoint is required" });

            var result = await _notificationService.RegisterDeviceAsync(subjectId, request);
            
            _logger.LogInformation("Device registered for push notifications: {UserId}, {DeviceType}", 
                subjectId, request.DeviceType);

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error registering device for push notifications");
            return StatusCode(500, new { message = "Failed to register device" });
        }
    }

    /// <summary>
    /// Unregister a device from push notifications
    /// </summary>
    [HttpDelete("register-device/{deviceId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UnregisterDevice(string deviceId)
    {
        try
        {
            var subjectId = _userContext.UserSubjectId;
            if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

            var success = await _notificationService.UnregisterDeviceAsync(subjectId, deviceId);
            
            if (!success)
                return NotFound(new { message = "Device not found" });

            _logger.LogInformation("Device unregistered from push notifications: {UserId}, {DeviceId}", 
                subjectId, deviceId);

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error unregistering device from push notifications");
            return StatusCode(500, new { message = "Failed to unregister device" });
        }
    }

    /// <summary>
    /// Get all registered devices for the current user
    /// </summary>
    [HttpGet("devices")]
    [ProducesResponseType(typeof(List<RegisteredDevice>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetRegisteredDevices()
    {
        try
        {
            var subjectId = _userContext.UserSubjectId;
            if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

            var devices = await _notificationService.GetRegisteredDevicesAsync(subjectId);
            
            return Ok(devices);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving registered devices");
            return StatusCode(500, new { message = "Failed to retrieve devices" });
        }
    }

    /// <summary>
    /// Send a test notification to the user
    /// </summary>
    [HttpPost("test")]
    [ProducesResponseType(typeof(TestNotificationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> SendTestNotification([FromBody] TestNotificationRequest? request = null)
    {
        try
        {
            var subjectId = _userContext.UserSubjectId;
            if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

            var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
            if (profile == null)
                return NotFound(new { message = "User profile not found" });

            var testMessage = request?.Message ?? "This is a test notification from Cortex. If you received this, your notification settings are working correctly!";
            var testTitle = request?.Title ?? "Test Notification";

            var result = await _notificationService.SendTestNotificationAsync(profile, testTitle, testMessage, request?.Type ?? "test");
            
            _logger.LogInformation("Test notification sent to user {UserId}: {Success} successful, {Failed} failed", 
                subjectId, result.SuccessfulDeliveries, result.FailedDeliveries);

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending test notification");
            return StatusCode(500, new { message = "Failed to send test notification" });
        }
    }

    /// <summary>
    /// Get notification history for the current user
    /// </summary>
    [HttpGet("history")]
    [ProducesResponseType(typeof(NotificationHistoryResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetNotificationHistory([FromQuery] int limit = 50, [FromQuery] int offset = 0)
    {
        try
        {
            var subjectId = _userContext.UserSubjectId;
            if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

            var history = await _notificationService.GetNotificationHistoryAsync(subjectId, limit, offset);
            
            return Ok(history);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving notification history");
            return StatusCode(500, new { message = "Failed to retrieve notification history" });
        }
    }

    /// <summary>
    /// Update notification preferences
    /// </summary>
    [HttpPut("preferences")]
    [ProducesResponseType(typeof(NotificationPreferences), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateNotificationPreferences([FromBody] NotificationPreferences request)
    {
        try
        {
            var subjectId = _userContext.UserSubjectId;
            if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

            var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
            if (profile == null)
                return NotFound(new { message = "User profile not found" });

            var result = await _notificationService.UpdateNotificationPreferencesAsync(profile, request);
            
            _logger.LogInformation("Notification preferences updated for user {UserId}", subjectId);

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating notification preferences");
            return StatusCode(500, new { message = "Failed to update notification preferences" });
        }
    }

    /// <summary>
    /// Get notification preferences
    /// </summary>
    [HttpGet("preferences")]
    [ProducesResponseType(typeof(NotificationPreferences), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetNotificationPreferences()
    {
        try
        {
            var subjectId = _userContext.UserSubjectId;
            if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

            var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
            if (profile == null)
                return NotFound(new { message = "User profile not found" });

            var preferences = await _notificationService.GetNotificationPreferencesAsync(profile);
            
            return Ok(preferences);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving notification preferences");
            return StatusCode(500, new { message = "Failed to retrieve notification preferences" });
        }
    }

    /// <summary>
    /// Manually trigger a weekly digest for testing (Admin role required in production)
    /// </summary>
    [HttpPost("weekly-digest")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> TriggerWeeklyDigest()
    {
        try
        {
            var subjectId = _userContext.UserSubjectId;
            if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

            var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
            if (profile == null)
                return NotFound(new { message = "User profile not found" });

            // Generate and send weekly digest
            var digestContent = await GenerateWeeklyDigestAsync(profile.Id);
            await _notificationService.SendWeeklyDigestAsync(profile, digestContent);
            
            _logger.LogInformation("Weekly digest manually triggered for user {UserId}", subjectId);

            return Ok(new { message = "Weekly digest sent successfully", content = digestContent });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error triggering weekly digest");
            return StatusCode(500, new { message = "Failed to trigger weekly digest" });
        }
    }

    private async Task<string> GenerateWeeklyDigestAsync(string userProfileId)
    {
        var weekAgo = DateTime.UtcNow.AddDays(-7);
        
        var profile = await _context.UserProfiles.FindAsync(userProfileId);
        if (profile == null) return "No activity this week.";
        
        var userId = profile.SubjectId;
        
        // Get notes created in the last week
        var newNotes = await _context.Notes
            .Where(n => n.UserId == userId && n.CreatedAt >= weekAgo && !n.IsDeleted)
            .CountAsync();
        
        // Get most used tags
        var topTags = await _context.NoteTags
            .Where(nt => _context.Notes.Any(n => n.Id == nt.NoteId && n.UserId == userId && n.CreatedAt >= weekAgo && !n.IsDeleted))
            .Join(_context.Tags, nt => nt.TagId, t => t.Id, (nt, t) => t.Name)
            .GroupBy(name => name)
            .Select(g => new { Tag = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .Take(3)
            .ToListAsync();
        
        // Get achievement count for the week
        var newAchievements = await _context.UserAchievements
            .Where(ua => ua.UserProfileId == userProfileId && ua.EarnedAt >= weekAgo)
            .CountAsync();
        
        // Build digest content
        var digestLines = new List<string>
        {
            $"?? Your Cortex Week in Review",
            "",
            $"?? Notes Created: {newNotes}",
        };
        
        if (topTags.Any())
        {
            digestLines.Add($"??? Top Tags: {string.Join(", ", topTags.Select(t => $"{t.Tag} ({t.Count})"))}");
        }
        
        if (newAchievements > 0)
        {
            digestLines.Add($"?? New Achievements: {newAchievements}");
        }
        
        if (newNotes == 0)
        {
            digestLines.Add("");
            digestLines.Add("?? Tip: Try adding some notes this week to build your knowledge base!");
        }
        else if (newNotes >= 10)
        {
            digestLines.Add("");
            digestLines.Add("?? Great job staying productive! You're building an impressive knowledge base.");
        }
        
        return string.Join("\n", digestLines);
    }
}

// Request/Response Models
public class DeviceRegistrationRequest
{
    public string Endpoint { get; set; } = string.Empty;
    public string P256dh { get; set; } = string.Empty;
    public string Auth { get; set; } = string.Empty;
    public string DeviceType { get; set; } = "web"; // web, mobile, desktop
    public string? DeviceName { get; set; }
    public string? UserAgent { get; set; }
}

public class DeviceRegistrationResponse
{
    public string DeviceId { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string? Message { get; set; }
    public DateTime RegisteredAt { get; set; }
}

public class RegisteredDevice
{
    public string DeviceId { get; set; } = string.Empty;
    public string DeviceType { get; set; } = string.Empty;
    public string? DeviceName { get; set; }
    public DateTime RegisteredAt { get; set; }
    public DateTime? LastUsed { get; set; }
    public bool IsActive { get; set; }
}

public class TestNotificationRequest
{
    public string? Title { get; set; }
    public string? Message { get; set; }
    public string Type { get; set; } = "test";
}

public class TestNotificationResponse
{
    public bool Success { get; set; }
    public int SuccessfulDeliveries { get; set; }
    public int FailedDeliveries { get; set; }
    public List<string> DeliveryMethods { get; set; } = new();
    public List<string> Errors { get; set; } = new();
    public DateTime SentAt { get; set; }
}

public class NotificationHistoryResponse
{
    public List<NotificationHistoryEntry> Notifications { get; set; } = new();
    public int TotalCount { get; set; }
    public int Limit { get; set; }
    public int Offset { get; set; }
}

public class NotificationHistoryEntry
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty; // sent, delivered, failed, read
    public List<string> DeliveryMethods { get; set; } = new();
    public DateTime SentAt { get; set; }
    public DateTime? ReadAt { get; set; }
}

public class NotificationPreferences
{
    public bool EmailNotifications { get; set; } = true;
    public bool PushNotifications { get; set; } = true;
    public bool AchievementNotifications { get; set; } = true;
    public bool WeeklyDigest { get; set; } = true;
    public bool MaintenanceAlerts { get; set; } = true;
    public bool NoteReminders { get; set; } = true;
    public bool SecurityAlerts { get; set; } = true;
    public string QuietHoursStart { get; set; } = "22:00";
    public string QuietHoursEnd { get; set; } = "08:00";
    public string Timezone { get; set; } = "UTC";
    public List<string> EmailTypes { get; set; } = new();
    public List<string> PushTypes { get; set; } = new();
}