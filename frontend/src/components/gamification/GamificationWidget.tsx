'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  TrophyIcon, 
  SparklesIcon, 
  StarIcon,
  ChevronRightIcon,
  FireIcon
} from '@heroicons/react/24/outline'
import { TrophyIcon as TrophyIconSolid } from '@heroicons/react/24/solid'
import { useGamificationApi } from '@/services/apiClient'
import { Achievement } from '@/api/cortex-api-client'
import { useAuth } from '@/contexts/AuthContext'

interface GamificationWidgetProps {
  compact?: boolean
  className?: string
}

export function GamificationWidget({ compact = false, className = '' }: GamificationWidgetProps) {
  const [userStats, setUserStats] = useState<any>(null)
  const [userProgress, setUserProgress] = useState<any>(null)
  const [recentAchievements, setRecentAchievements] = useState<Achievement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(!compact)
  const gamificationApi = useGamificationApi()
  const { isAuthenticated } = useAuth()

  const loadGamificationData = useCallback(async () => {
  if (!isAuthenticated) return
  try {
      setIsLoading(true)
      
      // Load user stats and progress
      const [stats, progress] = await Promise.all([
        gamificationApi.getUserStats(),
        gamificationApi.getUserProgress()
      ])
      
      setUserStats(stats)
      setUserProgress(progress)

      // Load recent achievements (unlocked ones)
      try {
        const achievements: any[] = await gamificationApi.getMyAchievements()
        // Get the 3 most recent achievements
        const recent = achievements
          .sort((a: any, b: any) => new Date(b.earnedAt || b.unlockedAt || 0).getTime() - new Date(a.earnedAt || a.unlockedAt || 0).getTime())
          .slice(0, 3)
          .map((ua: any) => ({ ...ua.achievement!, isUnlocked: true, unlockedAt: ua.earnedAt || ua.unlockedAt }))
        
        setRecentAchievements(recent)
      } catch (error) {
        console.log('No achievements unlocked yet')
        setRecentAchievements([])
      }
    } catch (error) {
      console.error('Failed to load gamification data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [gamificationApi, isAuthenticated])

  useEffect(() => {
    loadGamificationData()
  }, [loadGamificationData])

  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 ${className}`}>
        <div className="animate-pulse">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24"></div>
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!userStats) {
    return null
  }

  return (
    <motion.div 
      className={`bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div 
        className={`p-4 ${compact ? 'cursor-pointer' : ''}`}
        onClick={compact ? () => setIsExpanded(!isExpanded) : undefined}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                <TrophyIconSolid className="w-5 h-5 text-white" />
              </div>
              {userStats.loginStreak > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                  <FireIcon className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Level {userStats.level}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {userStats.totalXp ?? userStats.experiencePoints ?? 0} XP
              </p>
            </div>
          </div>
          {compact && (
            <ChevronRightIcon 
              className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
            />
          )}
        </div>

        {/* Progress Bar */}
        {userProgress && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
              <span>Level {userProgress.currentLevel}</span>
              <span>{userProgress.progressPercentage.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <motion.div 
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${userProgress.progressPercentage}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {userProgress.progressToNext} / {userProgress.totalProgressNeeded} XP to level {userProgress.currentLevel + 1}
            </p>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            {/* Stats Grid */}
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {userStats.totalNotes}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400">Notes</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {userStats.totalSearches}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400">Searches</div>
                </div>
              </div>

              {/* Login Streak */}
              {userStats.loginStreak > 0 && (
                <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FireIcon className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Streak
                      </span>
                    </div>
                    <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                      {userStats.loginStreak} days
                    </span>
                  </div>
                </div>
              )}

              {/* Recent Achievements */}
              {recentAchievements.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2 flex items-center">
                    <SparklesIcon className="w-4 h-4 mr-1 text-yellow-500" />
                    Recent Achievements
                  </h4>
                  <div className="space-y-2">
                    {recentAchievements.map((achievement, index) => (
                      <motion.div
                        key={achievement.id}
                        className="flex items-center space-x-3 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <div className="text-lg">{achievement.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {achievement.name}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            +{achievement.points} XP
                          </p>
                        </div>
                        <StarIcon className="w-4 h-4 text-yellow-500" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Call to Action */}
              {recentAchievements.length === 0 && (
                <div className="text-center py-4">
                  <TrophyIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Start using Cortex to unlock achievements!
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default GamificationWidget
