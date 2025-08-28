'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  UserCircleIcon, 
  Cog6ToothIcon, 
  ArrowRightOnRectangleIcon,
  ChartBarIcon,
  TrophyIcon,
  SunIcon,
  MoonIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import { useAppAuth } from '../hooks/useAppAuth'
import { useTheme } from '../contexts/ThemeContext'
import { useGamificationApi } from '../services/apiClient'

interface UserProfileDropdownProps {
  onNavigate?: (page: string) => void
}

const UserProfileDropdown: React.FC<UserProfileDropdownProps> = ({ onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { user, isAuthenticated, logout } = useAppAuth()
  const { theme, toggleTheme } = useTheme()
  const { getUserStats, getMyAchievements } = useGamificationApi()
  const [userStats, setUserStats] = useState<any>(null)
  const [topAchievement, setTopAchievement] = useState<string>('Administrator')

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && isOpen) {
      Promise.all([
        getUserStats().then(setUserStats),
        getMyAchievements().then((achievements: any[]) => {
          const unlockedAchievements = achievements.filter(a => a.isUnlocked)
          if (unlockedAchievements.length > 0) {
            // Get the most recent achievement or highest XP achievement
            const topAchievement = unlockedAchievements.sort((a, b) => (b.achievement?.xpReward || 0) - (a.achievement?.xpReward || 0))[0]
            setTopAchievement(topAchievement.achievement?.name || 'Administrator')
          }
        })
      ]).catch(console.error)
    }
  }, [isAuthenticated, isOpen, getUserStats, getMyAchievements])

  const handleNavigate = (page: string) => {
    setIsOpen(false)
    onNavigate?.(page)
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      setIsLoggingOut(false)
      setIsOpen(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
      >
        <UserCircleIcon className="h-5 w-5" />
        <span>Sign In</span>
      </motion.button>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex items-center space-x-3 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
      >
        <UserCircleIcon className="h-8 w-8 text-gray-600 dark:text-slate-400" />
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
            {user?.name || (user as any)?.username || 'User'}
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Administrator
          </p>
        </div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 z-50"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {(user?.name || (user as any)?.username || 'U')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100">
                    {user?.name || (user as any)?.username || 'User'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {topAchievement}
                  </p>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            {userStats && (
              <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {userStats.level || 1}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">Level</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                      {userStats.totalXp || 0}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">XP</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                      {userStats.totalNotes || 0}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">Notes</div>
                  </div>
                </div>
              </div>
            )}

            {/* Menu Items */}
            <div className="p-2">
              <button 
                onClick={() => handleNavigate('analytics')}
                className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <ChartBarIcon className="h-5 w-5 text-gray-400 dark:text-slate-400" />
                <span>Analytics</span>
              </button>
              
              <button 
                onClick={() => handleNavigate('achievements')}
                className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <TrophyIcon className="h-5 w-5 text-gray-400 dark:text-slate-400" />
                <span>Achievements</span>
              </button>

              <button 
                onClick={() => handleNavigate('settings')}
                className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <Cog6ToothIcon className="h-5 w-5 text-gray-400 dark:text-slate-400" />
                <span>Settings</span>
              </button>

              <button 
                onClick={toggleTheme}
                className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                {theme === 'dark' ? (
                  <SunIcon className="h-5 w-5 text-yellow-500" />
                ) : (
                  <MoonIcon className="h-5 w-5 text-gray-400 dark:text-slate-400" />
                )}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>

              <div className="border-t border-gray-200 dark:border-slate-700 mt-2 pt-2">
                <button 
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50"
                >
                  {isLoggingOut ? (
                    <div className="h-5 w-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ArrowRightOnRectangleIcon className="h-5 w-5" />
                  )}
                  <span>{isLoggingOut ? 'Signing out...' : 'Sign Out'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default UserProfileDropdown
