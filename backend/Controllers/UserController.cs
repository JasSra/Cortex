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
        private readonly ILogger<UserController> _logger;

        public UserController(
            CortexDbContext context,
            IUserContextAccessor userContext,
            IGamificationService gamificationService,
            ILogger<UserController> logger)
        {
            _context = context;
            _userContext = userContext;
            _gamificationService = gamificationService;
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
        /// Delete user profile and all associated data
        /// </summary>
        [HttpDelete("profile")]
        public async Task<ActionResult> DeleteUserProfile()
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

                // This will cascade delete all user's data due to foreign key constraints
                _context.UserProfiles.Remove(profile);
                await _context.SaveChangesAsync();

                _logger.LogInformation("Deleted user profile for subject ID: {SubjectId}", userSubjectId);
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
        /// Export all account data for the current user as JSON
        /// </summary>
    [HttpGet("account/export")]
    [ProducesResponseType(typeof(AccountExportResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ExportAccountData()
        {
            try
            {
                var subjectId = _userContext.UserSubjectId;
                if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

                var profile = await _context.UserProfiles
                    .Include(up => up.UserAchievements)
                    .FirstOrDefaultAsync(p => p.SubjectId == subjectId);
                if (profile == null) return NotFound(new { message = "User profile not found" });

                // Gather related data for export scoped by user
                var notes = await _context.Notes.Where(n => n.UserId == (_userContext.UserId ?? subjectId)).ToListAsync();
                var noteIds = notes.Select(n => n.Id).ToList();
                var chunks = await _context.NoteChunks.Where(c => noteIds.Contains(c.NoteId)).ToListAsync();
                var classifications = await _context.Classifications.Where(c => noteIds.Contains(c.NoteId)).ToListAsync();
                var tags = await _context.NoteTags.Where(nt => noteIds.Contains(nt.NoteId)).ToListAsync();

                var userAchievementDetails = await _context.UserAchievements
                    .Where(ua => ua.UserProfileId == profile.Id)
                    .Include(ua => ua.Achievement)
                    .ToListAsync();

                var export = new AccountExportResponse
                {
                    Profile = profile,
                    Notes = notes,
                    Chunks = chunks,
                    Classifications = classifications,
                    NoteTags = tags,
                    Achievements = userAchievementDetails.Select(ua => new UserAchievementExport
                    {
                        Id = ua.Id,
                        EarnedAt = ua.EarnedAt,
                        Progress = ua.Progress,
                        HasSeen = ua.HasSeen,
                        Achievement = ua.Achievement
                    }).ToList()
                };

                return Ok(export);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error exporting account data");
                return StatusCode(500, new { message = "Failed to export account data" });
            }
        }

        /// <summary>
        /// Delete all user-owned content but keep the account/profile
        /// </summary>
    [HttpDelete("account/data")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteAccountData()
        {
            try
            {
                var subjectId = _userContext.UserSubjectId;
                if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

                var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
                if (profile == null) return NotFound(new { message = "User profile not found" });

                var notes = await _context.Notes.Where(n => n.UserId == (_userContext.UserId ?? subjectId)).ToListAsync();
                var noteIds = notes.Select(n => n.Id).ToList();

                // Remove dependent data first where needed
                var chunks = _context.NoteChunks.Where(c => noteIds.Contains(c.NoteId));
                _context.NoteChunks.RemoveRange(chunks);

                var classifications = _context.Classifications.Where(c => noteIds.Contains(c.NoteId));
                _context.Classifications.RemoveRange(classifications);

                var noteTags = _context.NoteTags.Where(nt => noteIds.Contains(nt.NoteId));
                _context.NoteTags.RemoveRange(noteTags);

                // Remove notes
                _context.Notes.RemoveRange(notes);

                // Optionally clear achievements progress
                var userAchievements = _context.UserAchievements.Where(ua => ua.UserProfileId == profile.Id);
                _context.UserAchievements.RemoveRange(userAchievements);

                await _context.SaveChangesAsync();
                _logger.LogInformation("Deleted all account data for subject {SubjectId}", subjectId);
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting account data");
                return StatusCode(500, new { message = "Failed to delete account data" });
            }
        }

        /// <summary>
        /// Delete the account/profile itself (and all associated data via cascade)
        /// </summary>
    [HttpDelete("account")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteAccount()
        {
            try
            {
                var subjectId = _userContext.UserSubjectId;
                if (string.IsNullOrEmpty(subjectId)) return Unauthorized();

                var profile = await _context.UserProfiles.FirstOrDefaultAsync(p => p.SubjectId == subjectId);
                if (profile == null) return NotFound(new { message = "User profile not found" });

                // Remove all user-owned content first (same as DeleteAccountData)
                var notes = await _context.Notes.Where(n => n.UserId == (_userContext.UserId ?? subjectId)).ToListAsync();
                var noteIds = notes.Select(n => n.Id).ToList();

                var chunks = _context.NoteChunks.Where(c => noteIds.Contains(c.NoteId));
                _context.NoteChunks.RemoveRange(chunks);

                var classifications = _context.Classifications.Where(c => noteIds.Contains(c.NoteId));
                _context.Classifications.RemoveRange(classifications);

                var noteTags = _context.NoteTags.Where(nt => noteIds.Contains(nt.NoteId));
                _context.NoteTags.RemoveRange(noteTags);

                _context.Notes.RemoveRange(notes);

                var userAchievements = _context.UserAchievements.Where(ua => ua.UserProfileId == profile.Id);
                _context.UserAchievements.RemoveRange(userAchievements);

                // Finally remove the profile
                _context.UserProfiles.Remove(profile);
                await _context.SaveChangesAsync();

                _logger.LogInformation("Deleted account for subject {SubjectId}", subjectId);
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting account");
                return StatusCode(500, new { message = "Failed to delete account" });
            }
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
        public string Theme { get; set; } = "auto"; // light|dark|auto
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
}
