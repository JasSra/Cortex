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
                    Email = request.Email ?? _userContext.UserEmail,
                    Name = request.Name ?? _userContext.UserName,
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
}
