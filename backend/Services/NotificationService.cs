using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Controllers;

namespace CortexApi.Services;

public interface INotificationService
{
    Task<DeviceRegistrationResponse> RegisterDeviceAsync(string subjectId, DeviceRegistrationRequest request);
    Task<bool> UnregisterDeviceAsync(string subjectId, string deviceId);
    Task<List<RegisteredDevice>> GetRegisteredDevicesAsync(string subjectId);
    Task<TestNotificationResponse> SendTestNotificationAsync(UserProfile profile, string title, string message, string type);
    Task<NotificationHistoryResponse> GetNotificationHistoryAsync(string subjectId, int limit, int offset);
    Task<NotificationPreferences> UpdateNotificationPreferencesAsync(UserProfile profile, NotificationPreferences request);
    Task<NotificationPreferences> GetNotificationPreferencesAsync(UserProfile profile);
    Task SendAchievementNotificationAsync(UserProfile profile, Achievement achievement);
    Task SendWeeklyDigestAsync(UserProfile profile, string digestContent);
    Task SendMaintenanceAlertAsync(UserProfile profile, string alertMessage);
}

public class NotificationService : INotificationService
{
    private readonly CortexDbContext _context;
    private readonly ILogger<NotificationService> _logger;
    private readonly IConfiguration _configuration;
    private readonly HttpClient _httpClient;

    public NotificationService(
        CortexDbContext context,
        ILogger<NotificationService> logger,
        IConfiguration configuration,
        HttpClient httpClient)
    {
        _context = context;
        _logger = logger;
        _configuration = configuration;
        _httpClient = httpClient;
    }

    public async Task<DeviceRegistrationResponse> RegisterDeviceAsync(string subjectId, DeviceRegistrationRequest request)
    {
        try
        {
            var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
            if (profile == null)
                throw new InvalidOperationException("User profile not found");

            // Check if device already exists
            var existingDevice = await GetDeviceByEndpointAsync(request.Endpoint);
            if (existingDevice != null)
            {
                existingDevice.LastUsed = DateTime.UtcNow;
                existingDevice.IsActive = true;
                await _context.SaveChangesAsync();

                return new DeviceRegistrationResponse
                {
                    DeviceId = existingDevice.Id,
                    Success = true,
                    Message = "Device already registered and updated",
                    RegisteredAt = existingDevice.RegisteredAt
                };
            }

            // Create new device registration
            var device = new NotificationDevice
            {
                Id = Guid.NewGuid().ToString(),
                UserProfileId = profile.Id,
                Endpoint = request.Endpoint,
                P256dh = request.P256dh,
                Auth = request.Auth,
                DeviceType = request.DeviceType,
                DeviceName = request.DeviceName ?? $"{request.DeviceType} device",
                UserAgent = request.UserAgent,
                RegisteredAt = DateTime.UtcNow,
                LastUsed = DateTime.UtcNow,
                IsActive = true
            };

            _context.NotificationDevices.Add(device);
            await _context.SaveChangesAsync();

            return new DeviceRegistrationResponse
            {
                DeviceId = device.Id,
                Success = true,
                Message = "Device registered successfully",
                RegisteredAt = device.RegisteredAt
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error registering device for user {SubjectId}", subjectId);
            return new DeviceRegistrationResponse
            {
                Success = false,
                Message = ex.Message
            };
        }
    }

    public async Task<bool> UnregisterDeviceAsync(string subjectId, string deviceId)
    {
        try
        {
            var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
            if (profile == null) return false;

            var device = await _context.NotificationDevices
                .FirstOrDefaultAsync(d => d.Id == deviceId && d.UserProfileId == profile.Id);

            if (device == null) return false;

            _context.NotificationDevices.Remove(device);
            await _context.SaveChangesAsync();

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error unregistering device {DeviceId} for user {SubjectId}", deviceId, subjectId);
            return false;
        }
    }

    public async Task<List<RegisteredDevice>> GetRegisteredDevicesAsync(string subjectId)
    {
        try
        {
            var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
            if (profile == null) return new List<RegisteredDevice>();

            var devices = await _context.NotificationDevices
                .Where(d => d.UserProfileId == profile.Id && d.IsActive)
                .Select(d => new RegisteredDevice
                {
                    DeviceId = d.Id,
                    DeviceType = d.DeviceType,
                    DeviceName = d.DeviceName,
                    RegisteredAt = d.RegisteredAt,
                    LastUsed = d.LastUsed,
                    IsActive = d.IsActive
                })
                .OrderByDescending(d => d.LastUsed)
                .ToListAsync();

            return devices;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving devices for user {SubjectId}", subjectId);
            return new List<RegisteredDevice>();
        }
    }

    public async Task<TestNotificationResponse> SendTestNotificationAsync(UserProfile profile, string title, string message, string type)
    {
        var response = new TestNotificationResponse
        {
            SentAt = DateTime.UtcNow
        };

        var deliveryMethods = new List<string>();
        var errors = new List<string>();

        try
        {
            var preferences = await GetNotificationPreferencesAsync(profile);

            // Send email notification if enabled
            if (preferences.EmailNotifications && !string.IsNullOrEmpty(profile.Email))
            {
                try
                {
                    await SendEmailNotificationAsync(profile.Email, title, message);
                    deliveryMethods.Add("email");
                    response.SuccessfulDeliveries++;
                }
                catch (Exception ex)
                {
                    errors.Add($"Email delivery failed: {ex.Message}");
                    response.FailedDeliveries++;
                }
            }

            // Send push notification if enabled
            if (preferences.PushNotifications)
            {
                try
                {
                    var pushSent = await SendPushNotificationAsync(profile.Id, title, message, type);
                    if (pushSent > 0)
                    {
                        deliveryMethods.Add("push");
                        response.SuccessfulDeliveries += pushSent;
                    }
                }
                catch (Exception ex)
                {
                    errors.Add($"Push delivery failed: {ex.Message}");
                    response.FailedDeliveries++;
                }
            }

            // Log notification
            await LogNotificationAsync(profile.Id, type, title, message, "sent", deliveryMethods);

            response.Success = response.SuccessfulDeliveries > 0;
            response.DeliveryMethods = deliveryMethods;
            response.Errors = errors;

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending test notification to user {UserId}", profile.Id);
            response.Success = false;
            response.Errors.Add(ex.Message);
            return response;
        }
    }

    public async Task<NotificationHistoryResponse> GetNotificationHistoryAsync(string subjectId, int limit, int offset)
    {
        try
        {
            var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
            if (profile == null)
                return new NotificationHistoryResponse();

            var totalCount = await _context.NotificationHistory
                .CountAsync(n => n.UserProfileId == profile.Id);

            var notificationsQuery = await _context.NotificationHistory
                .Where(n => n.UserProfileId == profile.Id)
                .OrderByDescending(n => n.SentAt)
                .Skip(offset)
                .Take(limit)
                .ToListAsync();

            var notifications = notificationsQuery.Select(n => new NotificationHistoryEntry
            {
                Id = n.Id,
                Type = n.Type,
                Title = n.Title,
                Message = n.Message,
                Status = n.Status,
                DeliveryMethods = string.IsNullOrEmpty(n.DeliveryMethods) ? new List<string>() : JsonSerializer.Deserialize<List<string>>(n.DeliveryMethods) ?? new List<string>(),
                SentAt = n.SentAt,
                ReadAt = n.ReadAt
            }).ToList();

            return new NotificationHistoryResponse
            {
                Notifications = notifications,
                TotalCount = totalCount,
                Limit = limit,
                Offset = offset
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving notification history for user {SubjectId}", subjectId);
            return new NotificationHistoryResponse();
        }
    }

    public async Task<NotificationPreferences> UpdateNotificationPreferencesAsync(UserProfile profile, NotificationPreferences request)
    {
        try
        {
            // Get current settings
            var settings = string.IsNullOrWhiteSpace(profile.Preferences)
                ? new UserSettingsDto()
                : JsonSerializer.Deserialize<UserSettingsDto>(profile.Preferences) ?? new UserSettingsDto();

            // Update notification preferences
            settings.EmailNotifications = request.EmailNotifications;
            settings.PushNotifications = request.PushNotifications;
            settings.AchievementNotifications = request.AchievementNotifications;
            settings.WeeklyDigest = request.WeeklyDigest;
            settings.MaintenanceAlerts = request.MaintenanceAlerts;

            // Save updated settings
            profile.Preferences = JsonSerializer.Serialize(settings);
            profile.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return request;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating notification preferences for user {UserId}", profile.Id);
            throw;
        }
    }

    public async Task<NotificationPreferences> GetNotificationPreferencesAsync(UserProfile profile)
    {
        try
        {
            var settings = string.IsNullOrWhiteSpace(profile.Preferences)
                ? new UserSettingsDto()
                : JsonSerializer.Deserialize<UserSettingsDto>(profile.Preferences) ?? new UserSettingsDto();

            return new NotificationPreferences
            {
                EmailNotifications = settings.EmailNotifications,
                PushNotifications = settings.PushNotifications,
                AchievementNotifications = settings.AchievementNotifications,
                WeeklyDigest = settings.WeeklyDigest,
                MaintenanceAlerts = settings.MaintenanceAlerts,
                Timezone = settings.Timezone
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving notification preferences for user {UserId}", profile.Id);
            return new NotificationPreferences();
        }
    }

    public async Task SendAchievementNotificationAsync(UserProfile profile, Achievement achievement)
    {
        try
        {
            var preferences = await GetNotificationPreferencesAsync(profile);
            if (!preferences.AchievementNotifications) return;

            var title = "?? Achievement Unlocked!";
            var message = $"Congratulations! You've earned the '{achievement.Name}' achievement. {achievement.Description}";

            await SendNotificationAsync(profile, "achievement", title, message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending achievement notification for user {UserId}", profile.Id);
        }
    }

    public async Task SendWeeklyDigestAsync(UserProfile profile, string digestContent)
    {
        try
        {
            var preferences = await GetNotificationPreferencesAsync(profile);
            if (!preferences.WeeklyDigest) return;

            var title = "?? Your Weekly Cortex Digest";
            var message = digestContent;

            await SendNotificationAsync(profile, "weekly_digest", title, message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending weekly digest for user {UserId}", profile.Id);
        }
    }

    public async Task SendMaintenanceAlertAsync(UserProfile profile, string alertMessage)
    {
        try
        {
            var preferences = await GetNotificationPreferencesAsync(profile);
            if (!preferences.MaintenanceAlerts) return;

            var title = "?? Maintenance Alert";
            var message = alertMessage;

            await SendNotificationAsync(profile, "maintenance", title, message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending maintenance alert for user {UserId}", profile.Id);
        }
    }

    private async Task SendNotificationAsync(UserProfile profile, string type, string title, string message)
    {
        var preferences = await GetNotificationPreferencesAsync(profile);
        var deliveryMethods = new List<string>();

        // Send email if enabled
        if (preferences.EmailNotifications && !string.IsNullOrEmpty(profile.Email))
        {
            try
            {
                await SendEmailNotificationAsync(profile.Email, title, message);
                deliveryMethods.Add("email");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send email notification to {Email}", profile.Email);
            }
        }

        // Send push if enabled
        if (preferences.PushNotifications)
        {
            try
            {
                var pushSent = await SendPushNotificationAsync(profile.Id, title, message, type);
                if (pushSent > 0)
                {
                    deliveryMethods.Add("push");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send push notification to user {UserId}", profile.Id);
            }
        }

        // Log notification
        await LogNotificationAsync(profile.Id, type, title, message, "sent", deliveryMethods);
    }

    private async Task SendEmailNotificationAsync(string email, string title, string message)
    {
        // This would integrate with an email service (SendGrid, AWS SES, etc.)
        // For now, just log the email
        _logger.LogInformation("EMAIL NOTIFICATION: To={Email}, Title={Title}, Message={Message}", 
            email, title, message);
        
        // Simulate email sending
        await Task.Delay(100);
    }

    private async Task<int> SendPushNotificationAsync(string userProfileId, string title, string message, string type)
    {
        try
        {
            var devices = await _context.NotificationDevices
                .Where(d => d.UserProfileId == userProfileId && d.IsActive)
                .ToListAsync();

            var successCount = 0;

            foreach (var device in devices)
            {
                try
                {
                    // This would send a push notification using Web Push Protocol
                    // For now, just log the push notification
                    _logger.LogInformation("PUSH NOTIFICATION: Device={DeviceId}, Title={Title}, Message={Message}", 
                        device.Id, title, message);
                    
                    // Simulate push sending
                    await Task.Delay(50);
                    
                    device.LastUsed = DateTime.UtcNow;
                    successCount++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to send push notification to device {DeviceId}", device.Id);
                    // Mark device as inactive if delivery fails consistently
                }
            }

            if (successCount > 0)
            {
                await _context.SaveChangesAsync();
            }

            return successCount;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending push notifications to user {UserId}", userProfileId);
            return 0;
        }
    }

    private async Task LogNotificationAsync(string userProfileId, string type, string title, string message, string status, List<string> deliveryMethods)
    {
        try
        {
            var notification = new NotificationHistory
            {
                Id = Guid.NewGuid().ToString(),
                UserProfileId = userProfileId,
                Type = type,
                Title = title,
                Message = message,
                Status = status,
                DeliveryMethods = JsonSerializer.Serialize(deliveryMethods),
                SentAt = DateTime.UtcNow
            };

            _context.NotificationHistory.Add(notification);
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to log notification for user {UserId}", userProfileId);
        }
    }

    private async Task<NotificationDevice?> GetDeviceByEndpointAsync(string endpoint)
    {
        return await _context.NotificationDevices
            .FirstOrDefaultAsync(d => d.Endpoint == endpoint && d.IsActive);
    }
}