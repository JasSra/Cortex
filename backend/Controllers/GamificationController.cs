using CortexApi.Models;
using CortexApi.Security;
using CortexApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CortexApi.Data;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GamificationController : ControllerBase
{
    private readonly IGamificationService _gamificationService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<GamificationController> _logger;
    private readonly CortexDbContext _db;

    public GamificationController(
        IGamificationService gamificationService,
        IUserContextAccessor userContext,
        ILogger<GamificationController> logger,
        CortexDbContext db)
    {
        _gamificationService = gamificationService;
        _userContext = userContext;
        _logger = logger;
        _db = db;
    }

    /// <summary>
    /// Get all available achievements
    /// </summary>
    [HttpGet("achievements")]
    public async Task<IActionResult> GetAllAchievements()
    {
        try
        {
            var achievements = await _gamificationService.GetAllAchievementsAsync();
            return Ok(achievements);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching achievements");
            return StatusCode(500, "Failed to fetch achievements");
        }
    }

    /// <summary>
    /// Get current user's achievements
    /// </summary>
    [HttpGet("my-achievements")]
    public async Task<IActionResult> GetMyAchievements()
    {
        try
        {
            var userProfileId = await GetUserProfileIdAsync();
            if (string.IsNullOrEmpty(userProfileId))
            {
                return BadRequest("User profile not found");
            }

            var userAchievements = await _gamificationService.GetUserAchievementsAsync(userProfileId);
            return Ok(userAchievements);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user achievements");
            return StatusCode(500, "Failed to fetch user achievements");
        }
    }

    /// <summary>
    /// Get current user's stats
    /// </summary>
    [HttpGet("stats")]
    public async Task<IActionResult> GetUserStats()
    {
        try
        {
            var userProfileId = await GetUserProfileIdAsync();
            if (string.IsNullOrEmpty(userProfileId))
            {
                return BadRequest("User profile not found");
            }

            var userProfile = await _db.UserProfiles
                .FirstOrDefaultAsync(up => up.Id == userProfileId);
            
            if (userProfile == null)
            {
                return NotFound("User profile not found");
            }

            return Ok(new
            {
                userProfile.TotalNotes,
                userProfile.TotalSearches,
                userProfile.ExperiencePoints,
                userProfile.Level,
                userProfile.LoginStreak,
                userProfile.LastLoginAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user stats");
            return StatusCode(500, "Failed to fetch user stats");
        }
    }

    /// <summary>
    /// Get user's progress towards next level
    /// </summary>
    [HttpGet("progress")]
    public async Task<IActionResult> GetUserProgress()
    {
        try
        {
            var userProfileId = await GetUserProfileIdAsync();
            if (string.IsNullOrEmpty(userProfileId))
            {
                return BadRequest("User profile not found");
            }

            var userProfile = await _db.UserProfiles
                .FirstOrDefaultAsync(up => up.Id == userProfileId);
            
            if (userProfile == null)
            {
                return NotFound("User profile not found");
            }

            var currentLevel = userProfile.Level;
            var currentXP = userProfile.ExperiencePoints;
            var currentLevelXP = CalculateCurrentLevelXP(currentLevel);
            var nextLevelXP = CalculateNextLevelXP(currentLevel);
            var progressToNext = currentXP - currentLevelXP;
            var totalProgressNeeded = nextLevelXP - currentLevelXP;
            var progressPercentage = totalProgressNeeded > 0 ? (progressToNext * 100) / totalProgressNeeded : 100;

            return Ok(new
            {
                currentLevel,
                currentXP,
                progressToNext,
                totalProgressNeeded,
                progressPercentage = Math.Max(0, Math.Min(100, progressPercentage))
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user progress");
            return StatusCode(500, "Failed to fetch user progress");
        }
    }

    /// <summary>
    /// Manually trigger achievement check (useful for testing)
    /// </summary>
    [HttpPost("check-achievements")]
    public async Task<IActionResult> CheckAchievements()
    {
        try
        {
            var userProfileId = await GetUserProfileIdAsync();
            if (string.IsNullOrEmpty(userProfileId))
            {
                return BadRequest("User profile not found");
            }

            await _gamificationService.CheckAndAwardAchievementsAsync(userProfileId, "manual_check");
            return Ok(new { message = "Achievements checked successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking achievements");
            return StatusCode(500, "Failed to check achievements");
        }
    }

    /// <summary>
    /// Seed achievements into the database (no auth required for testing)
    /// </summary>
    [HttpPost("seed")]
    [AllowAnonymous]
    public async Task<IActionResult> SeedAchievements()
    {
        try
        {
            await _gamificationService.SeedAchievementsAsync();
            return Ok(new { message = "Achievements seeded successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error seeding achievements");
            return StatusCode(500, "Failed to seed achievements");
        }
    }

    /// <summary>
    /// Get all achievements for testing (no auth required)
    /// </summary>
    [HttpGet("all-achievements")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAllAchievementsTest()
    {
        try
        {
            var achievements = await _db.Achievements.ToListAsync();
            return Ok(new { 
                count = achievements.Count,
                achievements = achievements.Take(10).Select(a => new {
                    a.Id,
                    a.Name,
                    a.Description,
                    a.Icon,
                    a.Points,
                    a.Criteria
                })
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching all achievements");
            return StatusCode(500, "Failed to fetch achievements");
        }
    }

    private async Task<string> GetUserProfileIdAsync()
    {
        var subjectId = _userContext.UserSubjectId ?? _userContext.UserId;
        var userProfile = await _db.UserProfiles
            .FirstOrDefaultAsync(up => up.SubjectId == subjectId);
        return userProfile?.Id ?? string.Empty;
    }

    private int CalculateNextLevelXP(int currentLevel)
    {
        // XP needed for next level: (level^2) * 100
        return (currentLevel * currentLevel) * 100;
    }

    private int CalculateCurrentLevelXP(int currentLevel)
    {
        // XP needed for current level: ((level-1)^2) * 100
        return ((currentLevel - 1) * (currentLevel - 1)) * 100;
    }
}
