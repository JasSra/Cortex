'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChartBarIcon,
  TrophyIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  FireIcon,
  StarIcon,
  ClockIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  ChartPieIcon,
  BoltIcon,
  SparklesIcon,
  UserGroupIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline'
import { useGamificationApi, useGraphApi, useNotesApi } from '@/services/apiClient'
import { useAppAuth } from '@/hooks/useAppAuth'
import { useAuth } from '@/contexts/AuthContext'
import { useMascot } from '@/contexts/MascotContext'

interface AnalyticsData {
  totalNotes: number
  totalXp: number
  level: number
  loginStreak: number
  achievementsUnlocked: number
  totalAchievements: number
  weeklyActivity: Array<{ day: string; notes: number; searches: number; xp: number }>
  recentActivity: Array<{ action: string; date: string; xp: number; type: 'note' | 'search' | 'achievement' | 'voice' }>
  monthlyProgress: Array<{ month: string; notes: number; xp: number }>
  searchStats: {
    totalSearches: number
    avgResponseTime: number
    favoriteSearchTypes: Array<{ type: string; count: number }>
  }
  voiceStats: {
    totalVoiceCommands: number
    avgSessionLength: number
    preferredLanguage: string
  }
  knowledgeGraph: {
    totalEntities: number
    totalRelations: number
    mostConnectedEntity: string
  }
  timeDistribution: Array<{ hour: number; activity: number }>
  activityHeatmap: Array<Array<number>>
}

interface DateRange {
  start: Date
  end: Date
  label: string
}

const AnalyticsPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'detailed' | 'insights' | 'achievements'>('overview')
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    end: new Date(),
    label: 'Last 30 Days'
  })
  const [showCelebration, setShowCelebration] = useState(false)

  const { getUserStats, getUserProgress, getAllAchievements, getMyAchievements } = useGamificationApi()
  const { getNotes } = useNotesApi()
  const { getStatistics, getGraph, insights } = useGraphApi() as any
  const { isAuthenticated } = useAuth()
  const { speak, celebrate, suggest, idle, think } = useMascot()
  const { getAccessToken } = useAppAuth()

  // Date range presets
  const dateRanges: DateRange[] = [
    {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date(),
      label: 'Last 7 Days'
    },
    {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date(),
      label: 'Last 30 Days'
    },
    {
      start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      end: new Date(),
      label: 'Last 3 Months'
    },
    {
      start: new Date(new Date().getFullYear(), 0, 1),
      end: new Date(),
      label: 'This Year'
    }
  ]

  const loadAnalytics = useCallback(async () => {
    if (!isAuthenticated) {
      setAnalytics(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)  // Clear any previous errors
      think()

      const [userStats, userProgress, allAchievements, userAchievements, notes] = await Promise.all([
        getUserStats().catch(() => ({ totalNotes: 0, totalXp: 0, level: 1, loginStreak: 0, totalSearches: 0 })),
        getUserProgress().catch(() => ({ currentLevel: 1, currentXp: 0, progressToNext: 0 })),
        getAllAchievements().catch(() => [] as any[]),
        getMyAchievements().catch(() => [] as any[]),
        getNotes().catch(() => [] as any[]),
      ])

      // Load additional analytics data
  const token = await getAccessToken().catch(() => null)
      // Use existing typed endpoints; the specific analytics endpoints don't exist server-side yet
      const [graphStatistics, graphInsights] = await Promise.all([
        getStatistics().catch(() => ({})),
        (insights ? insights() : Promise.resolve(null)).catch(() => null)
      ])

  const searchData = { totalSearches: userStats.totalSearches ?? 0 } as any
  const graphData = graphStatistics as any
  const activityInfo = {} as any

      const unlockedCount = userAchievements.filter((ua: any) => ua.isUnlocked).length

  // Heatmap placeholder (no backend yet) - keep stable zeros
  const heatmapData = Array(7).fill(null).map(() => Array(24).fill(0))

  // Time distribution placeholder
  const timeDistribution = Array(24).fill(null).map((_, hour) => ({ hour, activity: 0 }))

      // Weekly activity approximation from totals (until detailed endpoint exists)
      const avgPerDay = (val: number) => Math.max(0, Math.round((val || 0) / 7))
      const weeklyActivity = [
        { day: 'Mon', notes: avgPerDay(userStats.totalNotes), searches: avgPerDay(userStats.totalSearches), xp: avgPerDay(userStats.totalXp) },
        { day: 'Tue', notes: avgPerDay(userStats.totalNotes), searches: avgPerDay(userStats.totalSearches), xp: avgPerDay(userStats.totalXp) },
        { day: 'Wed', notes: avgPerDay(userStats.totalNotes), searches: avgPerDay(userStats.totalSearches), xp: avgPerDay(userStats.totalXp) },
        { day: 'Thu', notes: avgPerDay(userStats.totalNotes), searches: avgPerDay(userStats.totalSearches), xp: avgPerDay(userStats.totalXp) },
        { day: 'Fri', notes: avgPerDay(userStats.totalNotes), searches: avgPerDay(userStats.totalSearches), xp: avgPerDay(userStats.totalXp) },
        { day: 'Sat', notes: avgPerDay(userStats.totalNotes), searches: avgPerDay(userStats.totalSearches), xp: avgPerDay(userStats.totalXp) },
        { day: 'Sun', notes: avgPerDay(userStats.totalNotes), searches: avgPerDay(userStats.totalSearches), xp: avgPerDay(userStats.totalXp) }
      ]

      // Monthly progress placeholder (zeros) until history API is added
      const monthlyProgress = [
        { month: 'Jan', notes: 0, xp: 0 },
        { month: 'Feb', notes: 0, xp: 0 },
        { month: 'Mar', notes: 0, xp: 0 },
        { month: 'Apr', notes: 0, xp: 0 },
        { month: 'May', notes: 0, xp: 0 },
        { month: 'Jun', notes: 0, xp: 0 }
      ]

      // Enhanced recent activity with types
  const recentActivity: Array<{ action: string; date: string; xp: number; type: 'note' | 'search' | 'achievement' | 'voice' }> = []

      const totalNotes = Array.isArray(notes) ? notes.length : (userStats.totalNotes || 0)

      setAnalytics({
        totalNotes,
        totalXp: userStats.totalXp || 0,
        level: userStats.level || 1,
        loginStreak: userStats.loginStreak || 0,
        achievementsUnlocked: unlockedCount,
        totalAchievements: allAchievements.length,
        weeklyActivity,
        recentActivity,
        monthlyProgress,
        searchStats: {
          totalSearches: searchData?.totalSearches || 0,
          avgResponseTime: 0,
          favoriteSearchTypes: []
        },
        voiceStats: {
          totalVoiceCommands: activityInfo?.voiceCommands || 0,
          avgSessionLength: activityInfo?.avgSessionLength || 0,
          preferredLanguage: 'English'
        },
        knowledgeGraph: {
          totalEntities: (Object.values(graphData || {}) as any[]).reduce((a: number, b: any) => a + (typeof b === 'number' ? b : 0), 0) || (graphInsights?.totalEntities ?? 0),
          totalRelations: graphInsights?.totalRelationships ?? 0,
          mostConnectedEntity: graphInsights?.topHubs?.[0]?.entityLabel || 'N/A'
        },
        timeDistribution,
        activityHeatmap: heatmapData
      })

      // Check for new achievements and celebrate
      const newAchievements = userAchievements.filter((ua: any) => 
        ua.isUnlocked && new Date(ua.unlockedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      )

      if (newAchievements.length > 0) {
        setShowCelebration(true)
        celebrate()
        speak(`Congratulations! You've unlocked ${newAchievements.length} new achievement${newAchievements.length > 1 ? 's' : ''}!`)
        setTimeout(() => setShowCelebration(false), 3000)
      } else {
        speak(`Welcome back! You're level ${userStats.level || 1} with ${userStats.totalXp || 0} XP, and ${userStats.totalNotes || 0} notes.`)
      }

    } catch (error) {
      console.error('Failed to load analytics:', error)
      setError('Some analytics data could not be loaded. This may be due to backend services being unavailable.')
      
      // Provide minimal fallback analytics to avoid empty UI
      setAnalytics({
        totalNotes: 0,
        totalXp: 0,
        level: 1,
        loginStreak: 0,
        achievementsUnlocked: 0,
        totalAchievements: 0,
        weeklyActivity: [
          { day: 'Mon', notes: 0, searches: 0, xp: 0 },
          { day: 'Tue', notes: 0, searches: 0, xp: 0 },
          { day: 'Wed', notes: 0, searches: 0, xp: 0 },
          { day: 'Thu', notes: 0, searches: 0, xp: 0 },
          { day: 'Fri', notes: 0, searches: 0, xp: 0 },
          { day: 'Sat', notes: 0, searches: 0, xp: 0 },
          { day: 'Sun', notes: 0, searches: 0, xp: 0 }
        ],
        recentActivity: [],
        monthlyProgress: [],
        searchStats: { totalSearches: 0, avgResponseTime: 0, favoriteSearchTypes: [] },
        voiceStats: { totalVoiceCommands: 0, avgSessionLength: 0, preferredLanguage: 'English' },
        knowledgeGraph: { totalEntities: 0, totalRelations: 0, mostConnectedEntity: 'N/A' },
        timeDistribution: Array(24).fill(null).map((_, hour) => ({ hour, activity: 0 })),
        activityHeatmap: Array(7).fill(null).map(() => Array(24).fill(0))
      })
      speak('Failed to load some analytics, showing partial data.', 'error')
    } finally {
      setLoading(false)
      idle()
    }
  }, [isAuthenticated, getUserStats, getUserProgress, getAllAchievements, getMyAchievements, getStatistics, insights, speak, celebrate, think, idle, getAccessToken, getNotes])

  // Run once on mount
  useEffect(() => {
    loadAnalytics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-run when date range changes (and user is authenticated)
  useEffect(() => {
    if (!isAuthenticated) return
    loadAnalytics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end, isAuthenticated])

  // Trigger insights based on data
  useEffect(() => {
    if (analytics && !loading) {
      // Generate insights
      setTimeout(() => {
        if (analytics.loginStreak >= 7) {
          suggest("Your 7-day streak is amazing! Keep it up to unlock the 'Consistent Learner' badge!")
        } else if (analytics.weeklyActivity.reduce((sum, day) => sum + day.notes, 0) > 30) {
          suggest("You've been very productive this week! Time for a knowledge graph exploration?")
        } else if (analytics.searchStats.totalSearches > 200) {
          suggest("You're a search master! Have you tried our advanced voice commands?")
        }
      }, 5000)
    }
  }, [analytics, loading, suggest])

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
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full"
        />
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

  const getActivityTypeIcon = (type: string) => {
    switch (type) {
      case 'note': return <DocumentTextIcon className="w-4 h-4" />
      case 'search': return <MagnifyingGlassIcon className="w-4 h-4" />
      case 'achievement': return <TrophyIcon className="w-4 h-4" />
      case 'voice': return <BoltIcon className="w-4 h-4" />
      default: return <SparklesIcon className="w-4 h-4" />
    }
  }

  const getActivityTypeColor = (type: string) => {
    switch (type) {
      case 'note': return 'text-blue-600 dark:text-blue-400'
      case 'search': return 'text-green-600 dark:text-green-400'
      case 'achievement': return 'text-yellow-600 dark:text-yellow-400'
      case 'voice': return 'text-purple-600 dark:text-purple-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Celebration Animation */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          >
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                className="text-6xl mb-4"
              >
                🎉
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                New Achievement!
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                You&apos;re making great progress!
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
              <p className="text-gray-600 dark:text-gray-400">Track your progress, insights, and achievements</p>
            </div>
            
            {/* Date Range Selector */}
            <div className="flex gap-2">
              {dateRanges.map((range) => (
                <button
                  key={range.label}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                    dateRange.label === range.label
                      ? 'bg-purple-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <h3 className="font-medium text-yellow-800 dark:text-yellow-300">Partial Data Available</h3>
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">{error}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Tab Navigation */}
          <div className="flex gap-1 bg-white dark:bg-gray-800 p-1 rounded-lg">
            {[
              { id: 'overview', label: 'Overview', icon: <ChartBarIcon className="w-4 h-4" /> },
              { id: 'detailed', label: 'Detailed', icon: <ChartPieIcon className="w-4 h-4" /> },
              { id: 'insights', label: 'Insights', icon: <SparklesIcon className="w-4 h-4" /> },
              { id: 'achievements', label: 'Achievements', icon: <TrophyIcon className="w-4 h-4" /> }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              {/* Main Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl text-white shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100">Total Notes</p>
                      <p className="text-3xl font-bold">{analytics.totalNotes}</p>
                      <p className="text-blue-200 text-sm">+12% this week</p>
                    </div>
                    <DocumentTextIcon className="h-10 w-10 text-blue-200" />
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="bg-gradient-to-br from-yellow-500 to-yellow-600 p-6 rounded-2xl text-white shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-yellow-100">Total XP</p>
                      <p className="text-3xl font-bold">{analytics.totalXp}</p>
                      <p className="text-yellow-200 text-sm">Level {analytics.level}</p>
                    </div>
                    <StarIcon className="h-10 w-10 text-yellow-200" />
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-2xl text-white shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100">Searches</p>
                      <p className="text-3xl font-bold">{analytics.searchStats.totalSearches}</p>
                      <p className="text-green-200 text-sm">{analytics.searchStats.avgResponseTime}s avg</p>
                    </div>
                    <MagnifyingGlassIcon className="h-10 w-10 text-green-200" />
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="bg-gradient-to-br from-orange-500 to-orange-600 p-6 rounded-2xl text-white shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-100">Login Streak</p>
                      <p className="text-3xl font-bold">{analytics.loginStreak}</p>
                      <p className="text-orange-200 text-sm">days in a row</p>
                    </div>
                    <FireIcon className="h-10 w-10 text-orange-200" />
                  </div>
                </motion.div>
              </div>

              {/* Weekly Activity Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Weekly Activity</h3>
                  <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-400">Notes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-400">Searches</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-400">XP</span>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-7 gap-4">
                  {analytics.weeklyActivity.map((day, index) => (
                    <motion.div
                      key={day.day}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="text-center"
                    >
                      <div className="space-y-2 mb-3">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${(day.notes / 12) * 60 + 20}px` }}
                          transition={{ delay: index * 0.1, duration: 0.5 }}
                          className="bg-blue-500 rounded-t mx-auto w-8"
                        />
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${(day.searches / 25) * 60 + 20}px` }}
                          transition={{ delay: index * 0.1 + 0.2, duration: 0.5 }}
                          className="bg-green-500 rounded-t mx-auto w-8"
                        />
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${(day.xp / 156) * 60 + 20}px` }}
                          transition={{ delay: index * 0.1 + 0.4, duration: 0.5 }}
                          className="bg-purple-500 rounded-t mx-auto w-8"
                        />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{day.day}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{day.notes}n · {day.searches}s</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Activity Heatmap */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700"
              >
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Activity Heatmap</h3>
                <div className="space-y-1">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, dayIndex) => (
                    <div key={day} className="flex items-center gap-2">
                      <span className="w-8 text-xs text-gray-600 dark:text-gray-400">{day}</span>
                      <div className="flex gap-1">
                        {analytics.activityHeatmap[dayIndex]?.map((activity, hourIndex) => (
                          <motion.div
                            key={hourIndex}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: (dayIndex * 24 + hourIndex) * 0.01 }}
                            className={`w-3 h-3 rounded-sm ${
                              activity === 0 ? 'bg-gray-100 dark:bg-gray-700' :
                              activity <= 3 ? 'bg-green-200 dark:bg-green-800' :
                              activity <= 6 ? 'bg-green-400 dark:bg-green-600' :
                              'bg-green-600 dark:bg-green-400'
                            }`}
                            title={`${day} ${hourIndex}:00 - Activity: ${activity}`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-4 text-xs text-gray-600 dark:text-gray-400">
                  <span>Less</span>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((level) => (
                      <div
                        key={level}
                        className={`w-3 h-3 rounded-sm ${
                          level === 0 ? 'bg-gray-100 dark:bg-gray-700' :
                          level === 1 ? 'bg-green-200 dark:bg-green-800' :
                          level === 2 ? 'bg-green-400 dark:bg-green-600' :
                          'bg-green-600 dark:bg-green-400'
                        }`}
                      />
                    ))}
                  </div>
                  <span>More</span>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Recent Activity & Knowledge Graph Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Enhanced Recent Activity */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {analytics.recentActivity.map((activity, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + index * 0.1 }}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className={`p-2 rounded-lg bg-white dark:bg-gray-800 ${getActivityTypeColor(activity.type)}`}>
                      {getActivityTypeIcon(activity.type)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{activity.action}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{activity.date}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-purple-600 dark:text-purple-400">+{activity.xp}</span>
                      <StarIcon className="w-4 h-4 text-yellow-500" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Knowledge Graph & Voice Stats */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-4"
            >
              {/* Knowledge Graph Stats */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                  <GlobeAltIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Knowledge Graph</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{analytics.knowledgeGraph.totalEntities}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Entities</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{analytics.knowledgeGraph.totalRelations}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Relations</p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Most connected: <span className="font-medium text-purple-700 dark:text-purple-300">{analytics.knowledgeGraph.mostConnectedEntity}</span>
                  </p>
                </div>
              </div>

              {/* Voice Stats */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                  <BoltIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Voice Assistant</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Total Commands</span>
                    <span className="font-medium text-gray-900 dark:text-white">{analytics.voiceStats.totalVoiceCommands}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Avg Session</span>
                    <span className="font-medium text-gray-900 dark:text-white">{analytics.voiceStats.avgSessionLength} min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Language</span>
                    <span className="font-medium text-gray-900 dark:text-white">{analytics.voiceStats.preferredLanguage}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Achievement Progress */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 rounded-2xl text-white shadow-lg"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <TrophyIcon className="w-8 h-8 text-yellow-300" />
                <div>
                  <h3 className="text-xl font-semibold">Achievement Progress</h3>
                  <p className="text-purple-100">You&apos;re doing amazing!</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">{analytics.achievementsUnlocked}</p>
                <p className="text-purple-100">of {analytics.totalAchievements}</p>
              </div>
            </div>
            
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span>Progress</span>
                <span>{Math.round((analytics.achievementsUnlocked / analytics.totalAchievements) * 100)}%</span>
              </div>
              <div className="w-full bg-purple-400 rounded-full h-3">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(analytics.achievementsUnlocked / analytics.totalAchievements) * 100}%` }}
                  transition={{ delay: 0.6, duration: 1.5, ease: "easeOut" }}
                  className="bg-yellow-300 h-3 rounded-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 text-purple-100">
              <div className="flex items-center gap-2">
                <FireIcon className="w-5 h-5" />
                <span className="text-sm">{analytics.loginStreak} day streak</span>
              </div>
              <div className="flex items-center gap-2">
                <StarIcon className="w-5 h-5" />
                <span className="text-sm">Level {analytics.level}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

export default AnalyticsPage
