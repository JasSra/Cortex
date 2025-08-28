using CortexApi.Data;
using CortexApi.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CortexApi.Services;

public interface IGamificationService
{
    Task<List<Achievement>> GetAllAchievementsAsync();
    Task<List<UserAchievement>> GetUserAchievementsAsync(string userProfileId);
    Task<List<Achievement>> GetUnlockedAchievementsAsync(string userProfileId);
    Task CheckAndAwardAchievementsAsync(string userProfileId, string activityType, object? context = null);
    Task<UserProfile> UpdateUserStatsAsync(string userProfileId, string activityType, object? context = null);
    Task<int> CalculateUserLevelAsync(int experiencePoints);
    Task SeedAchievementsAsync();
}

public class GamificationService : IGamificationService
{
    private readonly CortexDbContext _context;
    private readonly ILogger<GamificationService> _logger;

    public GamificationService(CortexDbContext context, ILogger<GamificationService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<List<Achievement>> GetAllAchievementsAsync()
    {
        return await _context.Achievements
            .OrderBy(a => a.Category)
            .ThenBy(a => a.SortOrder)
            .ToListAsync();
    }

    public async Task<List<UserAchievement>> GetUserAchievementsAsync(string userProfileId)
    {
        return await _context.UserAchievements
            .Include(ua => ua.Achievement)
            .Where(ua => ua.UserProfileId == userProfileId)
            .OrderByDescending(ua => ua.EarnedAt)
            .ToListAsync();
    }

    public async Task<List<Achievement>> GetUnlockedAchievementsAsync(string userProfileId)
    {
        var unlockedIds = await _context.UserAchievements
            .Where(ua => ua.UserProfileId == userProfileId)
            .Select(ua => ua.AchievementId)
            .ToListAsync();

        return await _context.Achievements
            .Where(a => unlockedIds.Contains(a.Id))
            .OrderBy(a => a.Category)
            .ThenBy(a => a.SortOrder)
            .ToListAsync();
    }

    public async Task<UserProfile> UpdateUserStatsAsync(string userProfileId, string activityType, object? context = null)
    {
        var user = await _context.UserProfiles.FirstOrDefaultAsync(u => u.Id == userProfileId);
        if (user == null) return null!;

        var now = DateTime.UtcNow;
        user.UpdatedAt = now;

        switch (activityType.ToLower())
        {
            case "login":
                user.TotalLogins++;
                user.LastLoginAt = now;
                
                // Calculate login streak
                if (user.LastStreakDate.HasValue)
                {
                    var daysSinceLastLogin = (now.Date - user.LastStreakDate.Value.Date).Days;
                    if (daysSinceLastLogin == 1)
                    {
                        user.LoginStreak++;
                    }
                    else if (daysSinceLastLogin > 1)
                    {
                        user.LoginStreak = 1; // Reset streak
                    }
                    // If daysSinceLastLogin == 0, same day login, don't change streak
                }
                else
                {
                    user.LoginStreak = 1; // First login
                }
                user.LastStreakDate = now.Date;
                user.ExperiencePoints += 5; // 5 XP per login
                break;

            case "note_created":
                user.TotalNotes++;
                user.ExperiencePoints += 10; // 10 XP per note
                break;

            case "search_performed":
                user.TotalSearches++;
                user.ExperiencePoints += 2; // 2 XP per search
                break;

            case "time_spent":
                if (context is int minutes)
                {
                    user.TotalTimeSpentMinutes += minutes;
                    user.ExperiencePoints += minutes / 10; // 1 XP per 10 minutes
                }
                break;
        }

        // Update level based on XP
        user.Level = await CalculateUserLevelAsync(user.ExperiencePoints);

        await _context.SaveChangesAsync();
        return user;
    }

    public async Task CheckAndAwardAchievementsAsync(string userProfileId, string activityType, object? context = null)
    {
        var user = await _context.UserProfiles
            .Include(u => u.UserAchievements)
            .FirstOrDefaultAsync(u => u.Id == userProfileId);

        if (user == null) return;

        var allAchievements = await _context.Achievements.ToListAsync();
        var earnedAchievementIds = user.UserAchievements.Select(ua => ua.AchievementId).ToHashSet();

        foreach (var achievement in allAchievements.Where(a => !earnedAchievementIds.Contains(a.Id)))
        {
            if (await CheckAchievementCriteriaAsync(user, achievement))
            {
                await AwardAchievementAsync(user.Id, achievement.Id);
                user.ExperiencePoints += achievement.Points;
                _logger.LogInformation($"User {user.Name} earned achievement: {achievement.Name} {achievement.Icon}");
            }
        }

        await _context.SaveChangesAsync();
    }

    private async Task<bool> CheckAchievementCriteriaAsync(UserProfile user, Achievement achievement)
    {
        try
        {
            var criteria = JsonSerializer.Deserialize<Dictionary<string, object>>(achievement.Criteria);
            if (criteria == null) return false;

            return achievement.Id switch
            {
                // Welcome achievements
                "newbie" => user.TotalNotes == 0 && user.TotalLogins >= 1,
                "first_note" => user.TotalNotes >= 1,
                "getting_started" => user.TotalNotes >= 5,
                
                // Activity achievements
                "note_taker" => user.TotalNotes >= 10,
                "productive" => user.TotalNotes >= 25,
                "blazer" => user.TotalNotes >= 50,
                "power_user" => user.TotalNotes >= 100,
                "expert" => user.TotalNotes >= 250,
                "master" => user.TotalNotes >= 500,
                
                // Search achievements
                "curious" => user.TotalSearches >= 10,
                "researcher" => user.TotalSearches >= 50,
                "detective" => user.TotalSearches >= 100,
                "investigator" => user.TotalSearches >= 250,
                
                // Login streak achievements
                "consistent" => user.LoginStreak >= 3,
                "dedicated" => user.LoginStreak >= 7,
                "committed" => user.LoginStreak >= 14,
                "unstoppable" => user.LoginStreak >= 30,
                
                // Time-based achievements
                "active_user" => user.TotalTimeSpentMinutes >= 60, // 1 hour
                "time_spender" => user.TotalTimeSpentMinutes >= 300, // 5 hours
                "marathon_user" => user.TotalTimeSpentMinutes >= 600, // 10 hours
                
                // Recent activity achievements
                "early_bird" => await IsRecentLoginAsync(user, 1), // Less than 1 hour ago
                "night_owl" => await IsLateNightUserAsync(user),
                
                // Level achievements
                "level_up" => user.Level >= 5,
                "advanced" => user.Level >= 10,
                "elite" => user.Level >= 20,
                
                _ => false
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error checking criteria for achievement {achievement.Id}");
            return false;
        }
    }

    private async Task<bool> IsRecentLoginAsync(UserProfile user, int hours)
    {
        if (!user.LastLoginAt.HasValue) return false;
        return (DateTime.UtcNow - user.LastLoginAt.Value).TotalHours < hours;
    }

    private async Task<bool> IsLateNightUserAsync(UserProfile user)
    {
        if (!user.LastLoginAt.HasValue) return false;
        var hour = user.LastLoginAt.Value.Hour;
        return hour >= 22 || hour <= 4; // Between 10 PM and 4 AM
    }

    private async Task AwardAchievementAsync(string userProfileId, string achievementId)
    {
        var userAchievement = new UserAchievement
        {
            UserProfileId = userProfileId,
            AchievementId = achievementId,
            EarnedAt = DateTime.UtcNow,
            HasSeen = false
        };

        _context.UserAchievements.Add(userAchievement);
        await _context.SaveChangesAsync();
    }

    public async Task<int> CalculateUserLevelAsync(int experiencePoints)
    {
        // Simple level calculation: Level = sqrt(XP / 100) + 1
        // Level 1: 0-99 XP, Level 2: 100-399 XP, Level 3: 400-899 XP, etc.
        return (int)Math.Floor(Math.Sqrt(experiencePoints / 100.0)) + 1;
    }

    public async Task SeedAchievementsAsync()
    {
        if (await _context.Achievements.AnyAsync()) return; // Already seeded

        var achievements = new List<Achievement>
        {
            // Welcome & First Steps
            new Achievement
            {
                Id = "newbie",
                Name = "Just Born",
                Description = "Welcome to Cortex! You've joined but haven't created any notes yet.",
                Icon = "👶",
                Category = "welcome",
                Points = 10,
                SortOrder = 1
            },
            new Achievement
            {
                Id = "first_note",
                Name = "First Steps",
                Description = "Created your very first note! The journey begins.",
                Icon = "👣",
                Category = "welcome",
                Points = 25,
                SortOrder = 2
            },
            new Achievement
            {
                Id = "getting_started",
                Name = "Getting Started",
                Description = "Created 5 notes. You're getting the hang of this!",
                Icon = "🚀",
                Category = "milestone",
                Points = 50,
                SortOrder = 3
            },

            // Note Creation Milestones
            new Achievement
            {
                Id = "note_taker",
                Name = "Note Taker",
                Description = "Created 10 notes. Building your knowledge base!",
                Icon = "📝",
                Category = "milestone",
                Points = 75,
                SortOrder = 10
            },
            new Achievement
            {
                Id = "productive",
                Name = "Productive",
                Description = "Created 25 notes. You're on fire!",
                Icon = "🔥",
                Category = "milestone",
                Points = 100,
                SortOrder = 11
            },
            new Achievement
            {
                Id = "blazer",
                Name = "Blazer",
                Description = "Created 50 notes. Blazing through content!",
                Icon = "⚡",
                Category = "milestone",
                Points = 200,
                SortOrder = 12
            },
            new Achievement
            {
                Id = "power_user",
                Name = "Power User",
                Description = "Created 100 notes. You're a Cortex power user!",
                Icon = "💪",
                Category = "milestone",
                Points = 300,
                SortOrder = 13
            },
            new Achievement
            {
                Id = "expert",
                Name = "Expert",
                Description = "Created 250 notes. Expert level knowledge curator!",
                Icon = "🎓",
                Category = "milestone",
                Points = 500,
                SortOrder = 14
            },
            new Achievement
            {
                Id = "master",
                Name = "Master",
                Description = "Created 500 notes. You are a true Cortex master!",
                Icon = "👑",
                Category = "milestone",
                Points = 750,
                SortOrder = 15
            },

            // Search & Research
            new Achievement
            {
                Id = "curious",
                Name = "Curious",
                Description = "Performed 10 searches. Curiosity is the key to knowledge!",
                Icon = "🔍",
                Category = "search",
                Points = 50,
                SortOrder = 20
            },
            new Achievement
            {
                Id = "researcher",
                Name = "Researcher",
                Description = "Performed 50 searches. A dedicated researcher!",
                Icon = "🧐",
                Category = "search",
                Points = 100,
                SortOrder = 21
            },
            new Achievement
            {
                Id = "detective",
                Name = "Detective",
                Description = "Performed 100 searches. Nothing escapes your investigation!",
                Icon = "🕵️",
                Category = "search",
                Points = 200,
                SortOrder = 22
            },
            new Achievement
            {
                Id = "investigator",
                Name = "Master Investigator",
                Description = "Performed 250 searches. Elite investigation skills!",
                Icon = "🕵️‍♂️",
                Category = "search",
                Points = 300,
                SortOrder = 23
            },

            // Login Streaks
            new Achievement
            {
                Id = "consistent",
                Name = "Consistent",
                Description = "Logged in 3 days in a row. Building good habits!",
                Icon = "📅",
                Category = "streak",
                Points = 75,
                SortOrder = 30
            },
            new Achievement
            {
                Id = "dedicated",
                Name = "Dedicated",
                Description = "Logged in 7 days in a row. One week streak!",
                Icon = "🏆",
                Category = "streak",
                Points = 150,
                SortOrder = 31
            },
            new Achievement
            {
                Id = "committed",
                Name = "Committed",
                Description = "Logged in 14 days in a row. Two weeks of dedication!",
                Icon = "💎",
                Category = "streak",
                Points = 250,
                SortOrder = 32
            },
            new Achievement
            {
                Id = "unstoppable",
                Name = "Unstoppable",
                Description = "Logged in 30 days in a row. You're unstoppable!",
                Icon = "🔥",
                Category = "streak",
                Points = 500,
                SortOrder = 33
            },

            // Activity & Time
            new Achievement
            {
                Id = "early_bird",
                Name = "Early Bird",
                Description = "Active user! Last login was less than 1 hour ago.",
                Icon = "🌅",
                Category = "activity",
                Points = 25,
                SortOrder = 40
            },
            new Achievement
            {
                Id = "night_owl",
                Name = "Night Owl",
                Description = "Late night knowledge seeker! Active between 10 PM - 4 AM.",
                Icon = "🦉",
                Category = "activity",
                Points = 25,
                SortOrder = 41
            },
            new Achievement
            {
                Id = "active_user",
                Name = "Active User",
                Description = "Spent 1+ hours in Cortex. Time well invested!",
                Icon = "⏰",
                Category = "time",
                Points = 100,
                SortOrder = 42
            },
            new Achievement
            {
                Id = "time_spender",
                Name = "Time Spender",
                Description = "Spent 5+ hours in Cortex. Deep knowledge work!",
                Icon = "⏳",
                Category = "time",
                Points = 250,
                SortOrder = 43
            },
            new Achievement
            {
                Id = "marathon_user",
                Name = "Marathon User",
                Description = "Spent 10+ hours in Cortex. Marathon knowledge sessions!",
                Icon = "🏃‍♂️",
                Category = "time",
                Points = 500,
                SortOrder = 44
            },

            // Level Achievements
            new Achievement
            {
                Id = "level_up",
                Name = "Level Up!",
                Description = "Reached level 5. You're leveling up!",
                Icon = "⬆️",
                Category = "level",
                Points = 200,
                SortOrder = 50
            },
            new Achievement
            {
                Id = "advanced",
                Name = "Advanced",
                Description = "Reached level 10. Advanced Cortex user!",
                Icon = "🌟",
                Category = "level",
                Points = 400,
                SortOrder = 51
            },
            new Achievement
            {
                Id = "elite",
                Name = "Elite",
                Description = "Reached level 20. Elite status achieved!",
                Icon = "💫",
                Category = "level",
                Points = 800,
                SortOrder = 52
            }
        };

        _context.Achievements.AddRange(achievements);
        await _context.SaveChangesAsync();
        
        _logger.LogInformation($"Seeded {achievements.Count} achievements into the database");
    }
}
