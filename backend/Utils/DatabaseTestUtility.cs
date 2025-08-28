using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using CortexApi.Data;

namespace CortexApi.Utils
{
    public class DatabaseTestUtility
    {
        public static async Task TestGamificationData()
        {
            var options = new DbContextOptionsBuilder<CortexDbContext>()
                .UseSqlite("Data Source=Data/cortex.db")
                .Options;

            using var context = new CortexDbContext(options);
            
            var achievementCount = await context.Achievements.CountAsync();
            Console.WriteLine($"Total Achievements: {achievementCount}");
            
            if (achievementCount > 0)
            {
                var firstFive = await context.Achievements.Take(5).ToListAsync();
                foreach (var achievement in firstFive)
                {
                    Console.WriteLine($"🏆 {achievement.Name} - {achievement.Description} - {achievement.Icon}");
                }
            }
            
            var userProfiles = await context.UserProfiles.CountAsync();
            Console.WriteLine($"Total User Profiles: {userProfiles}");
        }
    }
}
