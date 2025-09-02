using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CortexApi.Data;
using CortexApi.Models;
using CortexApi.Security;
using CortexApi.Services;

namespace CortexApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UserController : ControllerBase
    {
        private readonly CortexDbContext _context;
        private readonly IUserContextAccessor _userContext;
        private readonly IGamificationService _gamificationService;
        private readonly IVectorService _vectorService;
        private readonly IGraphService _graphService;
        private readonly ILogger<UserController> _logger;

        public UserController(
            CortexDbContext context,
            IUserContextAccessor userContext,
            IGamificationService gamificationService,
            IVectorService vectorService,
            IGraphService graphService,
            ILogger<UserController> logger)
        {
            _context = context;
            _userContext = userContext;
            _gamificationService = gamificationService;
            _vectorService = vectorService;
            _graphService = graphService;
            _logger = logger;
        }

        /// <summary>
        /// Get current user's profile
        /// </summary>
        [HttpGet("profile")]
        public async Task<ActionResult<UserProfile>> GetUserProfile()
        {
            try
            {
                var userId = _userContext.UserId;
                var userSubjectId = _userContext.UserSubjectId;
                
                var profile = await _context.UserProfiles
                    .FirstOrDefaultAsync(p => p.SubjectId == userSubjectId);

                if (profile == null)
                {
                    return NotFound(new { message = "User profile not found" });
                }

                // Track login activity for gamification
                await _gamificationService.UpdateUserStatsAsync(profile.Id, "login");
                await _gamificationService.CheckAndAwardAchievementsAsync(profile.Id, "login");

                return Ok(profile);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving user profile");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        /// <summary>
        /// Create or update user profile
        /// </summary>
        [HttpPost("profile")]
        public async Task<ActionResult<UserProfile>> CreateOrUpdateUserProfile([FromBody] CreateUserProfileRequest request)
        {
            try
            {
                var userId = _userContext.UserId;
                var userSubjectId = _userContext.UserSubjectId;
                
                // Check if profile already exists
                var existingProfile = await _context.UserProfiles
                    .FirstOrDefaultAsync(p => p.SubjectId == userSubjectId);

                if (existingProfile != null)
                {
                    // Update existing profile
                    existingProfile.Email = request.Email ?? existingProfile.Email;
                    existingProfile.Name = request.Name ?? existingProfile.Name;
                    existingProfile.UpdatedAt = DateTime.UtcNow;
                    
                    await _context.SaveChangesAsync();

                    // Ensure default roles exist
                    await EnsureDefaultRolesAsync(userSubjectId ?? userId);

                    // Track login activity for gamification
                    await _gamificationService.UpdateUserStatsAsync(existingProfile.Id, "login");
                    await _gamificationService.CheckAndAwardAchievementsAsync(existingProfile.Id, "login");

                    return Ok(existingProfile);
                }

                // Create new profile
                var profile = new UserProfile
                {
                    SubjectId = userSubjectId ?? request.SubjectId ?? userId,
                    Email = request.Email ?? _userContext.UserEmail ?? string.Empty,
                    Name = request.Name ?? _userContext.UserName ?? string.Empty,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.UserProfiles.Add(profile);
                await _context.SaveChangesAsync();

                // Assign default roles (Admin, Editor, Reader)
                await EnsureDefaultRolesAsync(profile.SubjectId);

                // Award first time registration achievements
                await _gamificationService.UpdateUserStatsAsync(profile.Id, "registration");
                await _gamificationService.CheckAndAwardAchievementsAsync(profile.Id, "registration");

                _logger.LogInformation("Created user profile for subject ID: {SubjectId}", profile.SubjectId);
                return CreatedAtAction(nameof(GetUserProfile), new { }, profile);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating user profile");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        /// <summary>
        /// Update user profile
        /// </summary>
        [HttpPut("profile")]
        public async Task<ActionResult<UserProfile>> UpdateUserProfile([FromBody] UpdateUserProfileRequest request)
        {
            try
            {
                var userSubjectId = _userContext.UserSubjectId;
                
                var profile = await _context.UserProfiles
                    .FirstOrDefaultAsync(p => p.SubjectId == userSubjectId);

                if (profile == null)
                {
                    return NotFound(new { message = "User profile not found" });
                }

                // Update fields if provided
                if (!string.IsNullOrEmpty(request.Email))
                    profile.Email = request.Email;
                
                if (!string.IsNullOrEmpty(request.Name))
                    profile.Name = request.Name;
                
                if (!string.IsNullOrEmpty(request.Bio))
                    profile.Bio = request.Bio;
                
                if (!string.IsNullOrEmpty(request.Avatar))
                    profile.Avatar = request.Avatar;

                profile.UpdatedAt = DateTime.UtcNow;
                
                await _context.SaveChangesAsync();

                return Ok(profile);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating user profile");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        /// <summary>
        /// Delete user's data (notes, files, etc.) but keep the user profile
        /// </summary>
        [HttpDelete("data")]
        public async Task<ActionResult> DeleteUserData()
        {
            try
            {
                var userSubjectId = _userContext.UserSubjectId;
                var userId = _userContext.UserId;

                if (string.IsNullOrWhiteSpace(userSubjectId) && string.IsNullOrWhiteSpace(userId))
                {
                    return Unauthorized(new { message = "Unauthorized" });
                }

                var profile = await _context.UserProfiles
                    .FirstOrDefaultAsync(p => p.SubjectId == userSubjectId);

                if (profile == null)
                {
                    return NotFound(new { message = "User profile not found" });
                }

                // Perform data deletion in a single transaction to ensure consistency
                using var tx = await _context.Database.BeginTransactionAsync();

                // 1) Delete user Notes (and cascade to Chunks, Embeddings, Classifications, NoteTags, TextSpans)
                var notes = await _context.Notes
                    .IgnoreQueryFilters() // bypass per-user/soft-delete filters
                    .Where(n => n.UserId == userId)
                    .ToListAsync();
                if (notes.Count > 0)
                {
                    _context.Notes.RemoveRange(notes);
                }

                // 2) Delete StoredFiles owned by the user
                var files = await _context.StoredFiles
                    .Where(f => f.UserId == userId)
                    .ToListAsync();
                if (files.Count > 0)
                {
                    _context.StoredFiles.RemoveRange(files);
                }

                // 3) Reset user stats but keep the profile
                profile.TotalNotes = 0;
                profile.TotalSearches = 0;
                profile.ExperiencePoints = 0;
                profile.Level = 1;
                profile.LoginStreak = 0;
                profile.LastStreakDate = null;
                profile.TotalTimeSpentMinutes = 0;
                profile.UpdatedAt = DateTime.UtcNow;

                // 4) Delete user achievements
                var achievements = await _context.UserAchievements
                    .Where(a => a.UserProfileId == profile.Id)
                    .ToListAsync();
                if (achievements.Count > 0)
                {
                    _context.UserAchievements.RemoveRange(achievements);
                }

                await _context.SaveChangesAsync();

                // 5) Clean up vectors from Redis for each note
                foreach (var note in notes)
                {
                    try
                    {
                        await _vectorService.RemoveNoteAsync(note.Id);
                        _logger.LogDebug("Removed vectors for note {NoteId}", note.Id);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to remove vectors for note {NoteId}", note.Id);
                    }
                }

                // 6) Clean up graph entities and edges
                try
                {
                    await _graphService.CleanupUserEntitiesAsync(userId);
                    _logger.LogDebug("Cleaned up graph entities for user {UserId}", userId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to cleanup graph entities for user {UserId}", userId);
                }

                await tx.CommitAsync();

                _logger.LogInformation("Deleted user data but kept profile. SubjectId: {SubjectId}, UserId: {UserId}. NotesDeleted: {NotesCount}, FilesDeleted: {FilesCount}, AchievementsDeleted: {AchievementsCount}",
                    userSubjectId, userId, notes.Count, files.Count, achievements.Count);
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting user data");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        /// <summary>
        /// Delete user profile and all associated data
        /// </summary>
        [HttpDelete("profile")]
        public async Task<ActionResult> DeleteUserProfile()
        {
            try
            {
                var userSubjectId = _userContext.UserSubjectId;
                var userId = _userContext.UserId;

                if (string.IsNullOrWhiteSpace(userSubjectId) && string.IsNullOrWhiteSpace(userId))
                {
                    return Unauthorized(new { message = "Unauthorized" });
                }

                var profile = await _context.UserProfiles
                    .FirstOrDefaultAsync(p => p.SubjectId == userSubjectId);

                if (profile == null)
                {
                    return NotFound(new { message = "User profile not found" });
                }

                // Perform a comprehensive purge in a single transaction to ensure consistency
                using var tx = await _context.Database.BeginTransactionAsync();

                // 1) Delete user Notes (and cascade to Chunks, Embeddings, Classifications, NoteTags, TextSpans)
                var notes = await _context.Notes
                    .IgnoreQueryFilters() // bypass per-user/soft-delete filters
                    .Where(n => n.UserId == userId)
                    .ToListAsync();
                if (notes.Count > 0)
                {
                    _context.Notes.RemoveRange(notes);
                }

                // 2) Delete StoredFiles owned by the user
                var files = await _context.StoredFiles
                    .Where(f => f.UserId == userId)
                    .ToListAsync();
                if (files.Count > 0)
                {
                    _context.StoredFiles.RemoveRange(files);
                }

                // 3) Delete app-managed role assignments for this subject
                var roles = await _context.UserRoleAssignments
                    .Where(r => r.SubjectId == (userSubjectId ?? userId))
                    .ToListAsync();
                if (roles.Count > 0)
                {
                    _context.UserRoleAssignments.RemoveRange(roles);
                }

                // 4) Finally, delete the UserProfile itself (will cascade to UserAchievements,
                //    NotificationDevice, NotificationHistory via FK constraints)
                _context.UserProfiles.Remove(profile);

                await _context.SaveChangesAsync();

                // 5) Clean up vectors from Redis for each note
                foreach (var note in notes)
                {
                    try
                    {
                        await _vectorService.RemoveNoteAsync(note.Id);
                        _logger.LogDebug("Removed vectors for note {NoteId}", note.Id);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to remove vectors for note {NoteId}", note.Id);
                    }
                }

                // 6) Clean up graph entities and edges
                try
                {
                    await _graphService.CleanupUserEntitiesAsync(userId);
                    _logger.LogDebug("Cleaned up graph entities for user {UserId}", userId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to cleanup graph entities for user {UserId}", userId);
                }

                await tx.CommitAsync();

                _logger.LogInformation("Deleted user account and all associated data. SubjectId: {SubjectId}, UserId: {UserId}. NotesDeleted: {NotesCount}, FilesDeleted: {FilesCount}, RolesDeleted: {RolesCount}",
                    userSubjectId, userId, notes.Count, files.Count, roles.Count);
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting user profile");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        /// <summary>
        /// Get typed user settings stored in UserProfile.Preferences
        /// </summary>
        [HttpGet("settings")]
        [ProducesResponseType(typeof(UserSettingsDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetUserSettings()
        {
            try
            {
                var subjectId = _userContext.UserSubjectId;
                if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

                var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
                if (profile == null) return NotFound(new { message = "User profile not found" });

                var dto = string.IsNullOrWhiteSpace(profile.Preferences)
                    ? new UserSettingsDto()
                    : System.Text.Json.JsonSerializer.Deserialize<UserSettingsDto>(profile.Preferences) ?? new UserSettingsDto();

                return Ok(dto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving user settings");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        /// <summary>
        /// Update typed user settings stored in UserProfile.Preferences
        /// </summary>
        [HttpPut("settings")]
        [ProducesResponseType(typeof(UserSettingsDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UpdateUserSettings([FromBody] UserSettingsDto request)
        {
            try
            {
                var subjectId = _userContext.UserSubjectId;
                if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

                var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
                if (profile == null) return NotFound(new { message = "User profile not found" });

                profile.Preferences = System.Text.Json.JsonSerializer.Serialize(request);
                profile.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                return Ok(request);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating user settings");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        /// <summary>
        /// Get user's mascot configuration
        /// </summary>
        [HttpGet("mascot-profile")]
        [ProducesResponseType(typeof(MascotProfileDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetMascotProfile()
        {
            try
            {
                var subjectId = _userContext.UserSubjectId;
                if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

                var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
                if (profile == null) return NotFound(new { message = "User profile not found" });

                var settings = string.IsNullOrWhiteSpace(profile.Preferences)
                    ? new UserSettingsDto()
                    : System.Text.Json.JsonSerializer.Deserialize<UserSettingsDto>(profile.Preferences) ?? new UserSettingsDto();

                var mascotProfile = new MascotProfileDto
                {
                    Enabled = settings.MascotEnabled,
                    Personality = settings.MascotPersonality,
                    Animations = settings.MascotAnimations,
                    Voice = settings.MascotVoice,
                    Proactivity = settings.MascotProactivity,
                    InteractionHistory = await GetMascotInteractionHistoryAsync(profile.Id),
                    PersonalityQuirks = GetPersonalityQuirks(settings.MascotPersonality),
                    CustomResponses = await GetCustomMascotResponsesAsync(profile.Id)
                };

                return Ok(mascotProfile);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving mascot profile");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        /// <summary>
        /// Update user's mascot configuration
        /// </summary>
        [HttpPut("mascot-profile")]
        [ProducesResponseType(typeof(MascotProfileDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UpdateMascotProfile([FromBody] UpdateMascotProfileRequest request)
        {
            try
            {
                var subjectId = _userContext.UserSubjectId;
                if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

                var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
                if (profile == null) return NotFound(new { message = "User profile not found" });

                var settings = string.IsNullOrWhiteSpace(profile.Preferences)
                    ? new UserSettingsDto()
                    : System.Text.Json.JsonSerializer.Deserialize<UserSettingsDto>(profile.Preferences) ?? new UserSettingsDto();

                // Update mascot settings
                if (request.Enabled.HasValue) settings.MascotEnabled = request.Enabled.Value;
                if (!string.IsNullOrEmpty(request.Personality)) settings.MascotPersonality = request.Personality;
                if (request.Animations.HasValue) settings.MascotAnimations = request.Animations.Value;
                if (request.Voice.HasValue) settings.MascotVoice = request.Voice.Value;
                if (request.Proactivity.HasValue) settings.MascotProactivity = request.Proactivity.Value;

                // Validate personality
                var validPersonalities = new[] { "friendly", "professional", "playful", "minimal" };
                if (!validPersonalities.Contains(settings.MascotPersonality))
                {
                    return BadRequest(new { message = $"Invalid personality. Must be one of: {string.Join(", ", validPersonalities)}" });
                }

                // Validate proactivity range
                if (settings.MascotProactivity < 0.0 || settings.MascotProactivity > 1.0)
                {
                    return BadRequest(new { message = "Proactivity must be between 0.0 and 1.0" });
                }

                profile.Preferences = System.Text.Json.JsonSerializer.Serialize(settings);
                profile.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                // Return updated mascot profile
                var updatedProfile = new MascotProfileDto
                {
                    Enabled = settings.MascotEnabled,
                    Personality = settings.MascotPersonality,
                    Animations = settings.MascotAnimations,
                    Voice = settings.MascotVoice,
                    Proactivity = settings.MascotProactivity,
                    InteractionHistory = await GetMascotInteractionHistoryAsync(profile.Id),
                    PersonalityQuirks = GetPersonalityQuirks(settings.MascotPersonality),
                    CustomResponses = await GetCustomMascotResponsesAsync(profile.Id)
                };

                return Ok(updatedProfile);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating mascot profile");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        private Task<List<MascotInteraction>> GetMascotInteractionHistoryAsync(string userProfileId)
        {
            // This would retrieve interaction history from a dedicated table if implemented
            // For now, return empty list as placeholder
            return Task.FromResult(new List<MascotInteraction>());
        }

        private List<string> GetPersonalityQuirks(string personality)
        {
            return personality switch
            {
                "friendly" => new List<string> 
                { 
                    "Uses encouraging language", 
                    "Celebrates your achievements", 
                    "Offers helpful tips",
                    "Uses emojis in responses"
                },
                "professional" => new List<string> 
                { 
                    "Concise and direct communication", 
                    "Focus on productivity", 
                    "Formal language",
                    "Data-driven suggestions"
                },
                "playful" => new List<string> 
                { 
                    "Uses humor and puns", 
                    "Creative suggestions", 
                    "Animated reactions",
                    "Fun facts and trivia"
                },
                "minimal" => new List<string> 
                { 
                    "Brief responses only", 
                    "Only speaks when necessary", 
                    "No decorative language",
                    "Efficient interactions"
                },
                _ => new List<string>()
            };
        }

        private Task<List<string>> GetCustomMascotResponsesAsync(string userProfileId)
        {
            // This would retrieve custom responses from a dedicated table if implemented
            // For now, return empty list as placeholder
            return Task.FromResult(new List<string>());
        }

        private async Task EnsureDefaultRolesAsync(string subjectId)
        {
            var defaults = new[] { "Admin", "Editor", "Reader" };
            var existing = await _context.UserRoleAssignments
                .Where(r => r.SubjectId == subjectId)
                .Select(r => r.Role).ToListAsync();
            foreach (var role in defaults)
            {
                if (!existing.Contains(role, StringComparer.OrdinalIgnoreCase))
                {
                    _context.UserRoleAssignments.Add(new UserRoleAssignment
                    {
                        SubjectId = subjectId,
                        Role = role,
                        CreatedAt = DateTime.UtcNow
                    });
                }
            }
            await _context.SaveChangesAsync();
        }
    }

    public class AccountExportResponse
    {
        public UserProfile? Profile { get; set; }
        public List<Note>? Notes { get; set; }
        public List<NoteChunk>? Chunks { get; set; }
        public List<Classification>? Classifications { get; set; }
        public List<NoteTag>? NoteTags { get; set; }
        public List<UserAchievementExport>? Achievements { get; set; }
    }

    public class UserAchievementExport
    {
        public string? Id { get; set; }
        public DateTime EarnedAt { get; set; }
        public int Progress { get; set; }
        public bool HasSeen { get; set; }
        public Achievement? Achievement { get; set; }
    }

    public class CreateUserProfileRequest
    {
        public string? Email { get; set; }
        public string? Name { get; set; }
        public string? SubjectId { get; set; }
        public string? Bio { get; set; }
        public string? Avatar { get; set; }
    }

    public class UpdateUserProfileRequest
    {
        public string? Email { get; set; }
        public string? Name { get; set; }
        public string? Bio { get; set; }
        public string? Avatar { get; set; }
    }

    /// <summary>
    /// Typed settings persisted in UserProfile.Preferences
    /// </summary>
    public class UserSettingsDto
    {
        // Account
        public string Timezone { get; set; } = System.TimeZoneInfo.Utc.Id;
        public string Language { get; set; } = "en";
        // Privacy
        public string ProfileVisibility { get; set; } = "private"; // public|private|friends
        public bool DataSharing { get; set; } = false;
        public bool AnalyticsOptIn { get; set; } = true;
        public bool SearchHistory { get; set; } = true;
        // Voice
        public bool VoiceEnabled { get; set; } = true;
        public string WakeWord { get; set; } = "Hey Cortex";
        public string VoiceLanguage { get; set; } = "en-US";
        public double VoiceSpeed { get; set; } = 1.0;
        public double VoiceVolume { get; set; } = 0.8;
        public double MicrophoneSensitivity { get; set; } = 0.7;
        public bool ContinuousListening { get; set; } = false;
        // Mascot
        public bool MascotEnabled { get; set; } = true;
        public string MascotPersonality { get; set; } = "friendly"; // friendly|professional|playful|minimal
        public bool MascotAnimations { get; set; } = true;
        public bool MascotVoice { get; set; } = true;
        public double MascotProactivity { get; set; } = 0.5;
        // Appearance
        public string Theme { get; set; } = "auto"; // light|dark|auto|cybertron
        public string PrimaryColor { get; set; } = "#7c3aed";
        public string FontSize { get; set; } = "medium"; // small|medium|large
        public bool ReducedMotion { get; set; } = false;
        public bool HighContrast { get; set; } = false;
        // Notifications
        public bool EmailNotifications { get; set; } = true;
        public bool PushNotifications { get; set; } = true;
        public bool AchievementNotifications { get; set; } = true;
        public bool WeeklyDigest { get; set; } = true;
        public bool MaintenanceAlerts { get; set; } = true;
        // Security
        public bool TwoFactorEnabled { get; set; } = false;
        public bool LoginAlerts { get; set; } = true;
        public int SessionTimeout { get; set; } = 30;
        public bool DataEncryption { get; set; } = true;
    }

    /// <summary>
    /// Mascot profile data transfer object
    /// </summary>
    public class MascotProfileDto
    {
        public bool Enabled { get; set; } = true;
        public string Personality { get; set; } = "friendly";
        public bool Animations { get; set; } = true;
        public bool Voice { get; set; } = true;
        public double Proactivity { get; set; } = 0.5;
        public List<MascotInteraction> InteractionHistory { get; set; } = new();
        public List<string> PersonalityQuirks { get; set; } = new();
        public List<string> CustomResponses { get; set; } = new();
    }

    /// <summary>
    /// Request model for updating mascot profile
    /// </summary>
    public class UpdateMascotProfileRequest
    {
        public bool? Enabled { get; set; }
        public string? Personality { get; set; }
        public bool? Animations { get; set; }
        public bool? Voice { get; set; }
        public double? Proactivity { get; set; }
    }

    /// <summary>
    /// Mascot interaction history entry
    /// </summary>
    public class MascotInteraction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Type { get; set; } = string.Empty; // greeting, suggestion, celebration, reminder
        public string Message { get; set; } = string.Empty;
        public string UserResponse { get; set; } = string.Empty; // liked, dismissed, ignored
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public Dictionary<string, object> Context { get; set; } = new();
    }
}
