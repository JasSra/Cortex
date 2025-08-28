'use client'

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChartBarIcon,
  TrophyIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  FireIcon,
  StarIcon
} from '@heroicons/react/24/outline'
import { useGamificationApi } from '../../services/apiClient'
import { useAuth } from '../../contexts/AuthContext'

interface AnalyticsData {
  totalNotes: number
  totalXp: number
  level: number
  loginStreak: number
  achievementsUnlocked: number
  totalAchievements: number
  weeklyActivity: Array<{ day: string; notes: number }>
  recentActivity: Array<{ action: string; date: string; xp: number }>
}

const AnalyticsPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const { getUserStats, getUserProgress, getAllAchievements, getMyAchievements } = useGamificationApi()
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isAuthenticated) return

    const loadAnalytics = async () => {
      try {
        setLoading(true)
        const [userStats, userProgress, allAchievements, userAchievements] = await Promise.all([
          getUserStats(),
          getUserProgress(),
          getAllAchievements(),
          getMyAchievements()
        ])

        const unlockedCount = userAchievements.filter((ua: any) => ua.isUnlocked).length

        // Mock weekly activity data - in real app this would come from API
        const weeklyActivity = [
          { day: 'Mon', notes: 5 },
          { day: 'Tue', notes: 8 },
          { day: 'Wed', notes: 3 },
          { day: 'Thu', notes: 12 },
          { day: 'Fri', notes: 7 },
          { day: 'Sat', notes: 4 },
          { day: 'Sun', notes: 2 }
        ]

        // Mock recent activity
        const recentActivity = [
          { action: 'Created new note', date: '2 hours ago', xp: 10 },
          { action: 'Achieved "Note Taker"', date: '1 day ago', xp: 50 },
          { action: 'Updated classification', date: '2 days ago', xp: 5 },
          { action: 'Completed search', date: '3 days ago', xp: 2 }
        ]

        setAnalytics({
          totalNotes: userStats.totalNotes || 0,
          totalXp: userStats.experiencePoints || 0,
          level: userStats.level || 1,
          loginStreak: userStats.loginStreak || 0,
          achievementsUnlocked: unlockedCount,
          totalAchievements: allAchievements.length,
          weeklyActivity,
          recentActivity
        })
      } catch (error) {
        console.error('Failed to load analytics:', error)
      } finally {
        setLoading(false)
      }
    }

    loadAnalytics()
  }, [isAuthenticated, getUserStats, getUserProgress, getAllAchievements, getMyAchievements])

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-slate-400">Please sign in to view analytics</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-slate-400">Failed to load analytics data</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Analytics Dashboard</h1>
          <p className="text-gray-600 dark:text-slate-400">Track your progress and activity</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-slate-400">Total Notes</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{analytics.totalNotes}</p>
              </div>
              <DocumentTextIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-slate-400">Total XP</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{analytics.totalXp}</p>
              </div>
              <StarIcon className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-slate-400">Current Level</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{analytics.level}</p>
              </div>
              <ChartBarIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-slate-400">Login Streak</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{analytics.loginStreak}</p>
              </div>
              <FireIcon className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
          </motion.div>
        </div>

        {/* Weekly Activity Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Weekly Activity</h3>
          <div className="flex items-end justify-between h-32 space-x-2">
            {analytics.weeklyActivity.map((day, index) => (
              <div key={day.day} className="flex flex-col items-center flex-1">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(day.notes / 12) * 100}%` }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  className="bg-blue-600 dark:bg-blue-400 rounded-t w-full min-h-[4px]"
                />
                <span className="text-xs text-gray-500 dark:text-slate-400 mt-2">{day.day}</span>
                <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{day.notes}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity & Achievements */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {analytics.recentActivity.map((activity, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-xl"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{activity.action}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{activity.date}</p>
                  </div>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">+{activity.xp} XP</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Achievement Progress */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Achievement Progress</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-slate-400">Achievements Unlocked</span>
                <span className="text-sm font-bold text-gray-900 dark:text-slate-100">
                  {analytics.achievementsUnlocked} / {analytics.totalAchievements}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(analytics.achievementsUnlocked / analytics.totalAchievements) * 100}%` }}
                  transition={{ delay: 0.5, duration: 1 }}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full"
                />
              </div>
              <div className="flex items-center space-x-2 mt-4">
                <TrophyIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm text-gray-600 dark:text-slate-400">
                  {Math.round((analytics.achievementsUnlocked / analytics.totalAchievements) * 100)}% Complete
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

export default AnalyticsPage
