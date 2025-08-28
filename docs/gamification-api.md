# Gamification API Documentation

## Overview
The Cortex gamification system provides achievements, experience points, levels, and user progression tracking with emoji-based badges.

## Endpoints

### Get User Achievements
```
GET /api/gamification/my-achievements
Authorization: Bearer <token>
```
Returns user's unlocked achievements with details.

### Get User Stats
```
GET /api/gamification/stats
Authorization: Bearer <token>
```
Returns user's gamification statistics including:
- Experience points
- Current level
- Login streak
- Progress to next level
- Achievement count

### Get All Available Achievements
```
GET /api/gamification/achievements
Authorization: Bearer <token>
```
Returns all available achievements in the system.

### Check for New Achievements
```
POST /api/gamification/check-achievements
Authorization: Bearer <token>
```
Manually triggers achievement checking for the current user.

### Seed Achievements (Development)
```
POST /api/gamification/seed
```
Seeds the database with predefined achievements. No authentication required.

### List All Achievements (Testing)
```
GET /api/gamification/all-achievements
```
Returns all achievements for testing purposes. No authentication required.

## Achievement Categories

### Getting Started
- 🐣 **Just Born** (0 points) - Welcome to Cortex!
- 📝 **First Steps** (50 points) - Created your first note
- 🎯 **First Discovery** (50 points) - Performed your first search
- 🔍 **Curious Mind** (100 points) - Performed 5 searches

### Activity Milestones
- 📚 **Collector** (200 points) - Created 5 notes
- 🔥 **On Fire** (300 points) - Created 10 notes  
- 🚀 **Blazer** (500 points) - Created 50 notes
- 💪 **Power User** (800 points) - Performed 100 searches
- 🏆 **Master** (1000 points) - Created 100 notes

### Engagement
- ⏰ **Active User** (100 points) - Spent 1+ hours in Cortex
- ⚡ **Speed Demon** (150 points) - Logged in within 1 hour of last session
- 🔄 **Daily Habit** (200 points) - 7-day login streak
- 💎 **Dedicated** (500 points) - 30-day login streak
- 👑 **Legend** (1000 points) - 100-day login streak

### Progression Levels
- 🌱 **Beginner** (100 points) - Reached level 2
- 📈 **Intermediate** (300 points) - Reached level 5
- 🎓 **Advanced** (500 points) - Reached level 10
- 🌟 **Expert** (1000 points) - Reached level 20
- 🏅 **Elite** (1500 points) - Reached level 50

### Special Achievements
- 🌅 **Early Bird** (150 points) - First activity of the day
- 🌙 **Night Owl** (150 points) - Activity after 10 PM
- 🎉 **Milestone Hunter** (200 points) - Unlocked 10 achievements
- 🎯 **Achievement Master** (500 points) - Unlocked 20+ achievements
- 👨‍🔬 **Explorer** (300 points) - Used advanced search features
- 🔬 **Researcher** (400 points) - Performed 50+ searches

## Level System

Experience points determine user levels:
- Level calculation: `Math.floor(Math.sqrt(totalXP / 100)) + 1`
- XP for next level: `((currentLevel)^2) * 100`
- XP for current level: `((currentLevel - 1)^2) * 100`

## Response Examples

### User Stats Response
```json
{
  "userId": "user123",
  "experiencePoints": 1250,
  "level": 4,
  "loginStreak": 7,
  "totalNotes": 25,
  "totalSearches": 45,
  "achievementCount": 12,
  "nextLevelXP": 1600,
  "currentLevelXP": 900,
  "progressToNextLevel": 0.61
}
```

### Achievement Response
```json
{
  "id": "first_steps",
  "name": "First Steps",
  "description": "Created your first note. The journey begins!",
  "icon": "📝",
  "points": 50,
  "criteria": {},
  "unlockedAt": "2024-01-15T10:30:00Z"
}
```

## Integration Events

The gamification system automatically tracks these events:
- User login/profile access
- Note creation (via ingest endpoints)
- Search operations
- Session duration

No additional frontend integration required for basic tracking.

## Implementation Notes

1. All authenticated endpoints require a valid JWT token
2. Achievement checking is automatic on user activities
3. Login streaks are calculated based on daily unique logins
4. Experience points are cumulative and never decrease
5. Achievements can only be unlocked once per user
6. The system supports real-time achievement notifications

## Testing

Use the anonymous endpoints for development and testing:
- `/api/gamification/seed` - Populate achievements
- `/api/gamification/all-achievements` - List all available achievements

## Future Enhancements

- Achievement categories and filtering
- Leaderboards and social features  
- Custom achievement criteria
- Achievement sharing and social integration
- Progressive achievement unlocking
- Seasonal and time-limited achievements
