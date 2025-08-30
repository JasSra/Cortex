'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  TrophyIcon, 
  LockClosedIcon,
  CheckCircleIcon,
  CalendarIcon,
  GiftIcon
} from '@heroicons/react/24/outline'
import { useGamificationApi } from '@/services/apiClient'
import type { IAchievement, UserAchievement } from '@/api/cortex-api-client'

interface AchievementsPanelProps {
  className?: string
}

type AchievementView = IAchievement & { isUnlocked?: boolean; unlockedAt?: string }

export function AchievementsPanel({ className = '' }: AchievementsPanelProps) {
  const [achievements, setAchievements] = useState<AchievementView[]>([])
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const gamificationApi = useGamificationApi()
  const [showCelebrate, setShowCelebrate] = useState(false)

  const loadAchievements = useCallback(async () => {
    try {
      setIsLoading(true)
      
      // Load all achievements and user's unlocked achievements
      const [allAchievements, unlockedAchievements] = await Promise.all([
        gamificationApi.getAllAchievements(),
        gamificationApi.getMyAchievements().catch(() => []) // Handle case where user has no achievements
      ])
      
      // Mark achievements as unlocked
      const unlockedIds = new Set((unlockedAchievements as UserAchievement[]).map((ua: UserAchievement) => ua.achievementId || ''))
      const achievementsWithStatus: AchievementView[] = (allAchievements as IAchievement[]).map((achievement: IAchievement) => ({
        ...achievement,
        isUnlocked: unlockedIds.has(achievement.id || ''),
        unlockedAt: ((unlockedAchievements as UserAchievement[]).find((ua: UserAchievement) => ua.achievementId === achievement.id)?.earnedAt || undefined)?.toString()
      }))
      
      const wasUnlocked = achievementsWithStatus.some(a => a.isUnlocked)
      setAchievements(achievementsWithStatus)
      if (wasUnlocked) {
        setShowCelebrate(true)
        setTimeout(() => setShowCelebrate(false), 1800)
      }
      setUserAchievements(unlockedAchievements)
    } catch (error) {
      console.error('Failed to load achievements:', error)
    } finally {
      setIsLoading(false)
    }
  }, [gamificationApi])

  useEffect(() => {
    loadAchievements()
  }, [loadAchievements])

  const categories = [
    { id: 'all', name: 'All', icon: TrophyIcon },
    { id: 'unlocked', name: 'Unlocked', icon: CheckCircleIcon },
    { id: 'locked', name: 'Locked', icon: LockClosedIcon }
  ]

  const filteredAchievements = achievements.filter(achievement => {
    switch (selectedCategory) {
      case 'unlocked':
        return achievement.isUnlocked
      case 'locked':
        return !achievement.isUnlocked
      default:
        return true
    }
  })

  const unlockedCount = achievements.filter(a => a.isUnlocked).length
  const totalCount = achievements.length
  const completionPercentage = totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0

  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded"></div>
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded"></div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
              <TrophyIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Achievements
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {unlockedCount} of {totalCount} unlocked ({completionPercentage.toFixed(0)}%)
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <GiftIcon className="w-5 h-5 text-purple-500" />
            <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
              {achievements.reduce((sum, a) => sum + (a.isUnlocked ? (a.points || 0) : 0), 0)} XP earned
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
            <motion.div 
              className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${completionPercentage}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex space-x-2">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === category.id
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <category.icon className="w-4 h-4" />
              <span>{category.name}</span>
              <span className="bg-slate-200 dark:bg-slate-600 text-xs px-1.5 py-0.5 rounded">
                {category.id === 'unlocked' ? unlockedCount : 
                 category.id === 'locked' ? totalCount - unlockedCount : 
                 totalCount}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Sub-header actions */}
      <div className="px-6 pt-4 flex items-center justify-between">
        <div />
        <button
          onClick={() => gamificationApi.seedAchievements().then(loadAchievements)}
          className="text-xs px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700"
        >
          Seed demo achievements
        </button>
      </div>

      {/* Achievements Grid */}
      <div className="p-6">
        {showCelebrate && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-3">
            <div className="p-3 rounded-xl bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-700 flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-amber-600" />
              <span className="text-sm text-amber-800 dark:text-amber-300">New achievement unlocked!</span>
            </div>
          </motion.div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedCategory}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filteredAchievements.map((achievement, index) => (
              <motion.div
                key={achievement.id}
                className={`border rounded-xl p-4 transition-all duration-200 hover:shadow-md ${
                  achievement.isUnlocked
                    ? 'border-green-200 dark:border-green-700 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                }`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`text-2xl ${achievement.isUnlocked ? '' : 'grayscale opacity-50'}`}>
                      {achievement.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-semibold ${
                        achievement.isUnlocked 
                          ? 'text-slate-900 dark:text-slate-100' 
                          : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {achievement.name}
                      </h3>
                    </div>
                  </div>
                  {achievement.isUnlocked ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <LockClosedIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  )}
                </div>

                <p className={`text-sm mb-3 ${
                  achievement.isUnlocked 
                    ? 'text-slate-700 dark:text-slate-300' 
                    : 'text-slate-500 dark:text-slate-400'
                }`}>
                  {achievement.description}
                </p>

                <div className="flex items-center justify-between text-xs">
                  <div className={`flex items-center space-x-1 ${
                    achievement.isUnlocked 
                      ? 'text-purple-600 dark:text-purple-400' 
                      : 'text-slate-500 dark:text-slate-400'
                  }`}>
                    <GiftIcon className="w-3 h-3" />
                    <span>{achievement.points} XP</span>
                  </div>
                  
                  {achievement.isUnlocked && achievement.unlockedAt && (
                    <div className="flex items-center space-x-1 text-green-600 dark:text-green-400">
                      <CalendarIcon className="w-3 h-3" />
                      <span>{new Date(achievement.unlockedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>

        {filteredAchievements.length === 0 && (
          <div className="text-center py-12">
            <TrophyIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">
              {selectedCategory === 'unlocked' 
                ? "No achievements unlocked yet. Keep using Cortex!"
                : selectedCategory === 'locked'
                ? "All achievements unlocked! Great job!"
                : "No achievements found."
              }
            </p>
            {selectedCategory !== 'locked' && (
              <button
                onClick={() => gamificationApi.seedAchievements().then(loadAchievements)}
                className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Try demo unlocks
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AchievementsPanel
