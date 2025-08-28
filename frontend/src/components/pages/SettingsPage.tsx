'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Cog6ToothIcon,
  UserIcon,
  BellIcon,
  ShieldCheckIcon,
  PaintBrushIcon,
  GlobeAltIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'

const SettingsPage: React.FC = () => {
  const { theme, toggleTheme } = useTheme()
  const { user, isAuthenticated } = useAuth()
  const [notifications, setNotifications] = useState({
    achievements: true,
    weeklyReport: true,
    systemUpdates: false,
    emailDigest: true
  })

  const [preferences, setPreferences] = useState({
    language: 'en',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    autoSave: true
  })

  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handlePreferenceChange = (key: keyof typeof preferences, value: string | boolean) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }))
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-slate-400">Please sign in to access settings</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Settings</h1>
          <p className="text-gray-600 dark:text-slate-400">Manage your account preferences and settings</p>
        </div>

        {/* Profile Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
        >
          <div className="flex items-center space-x-3 mb-6">
            <UserIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Profile Settings</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={user?.name || user?.username || ''}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your display name"
                readOnly
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                User ID
              </label>
              <input
                type="text"
                value={user?.username || ''}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-gray-50 dark:bg-slate-600 text-gray-900 dark:text-slate-100"
                title="User ID (read-only)"
                readOnly
              />
            </div>
          </div>
        </motion.div>

        {/* Appearance Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
        >
          <div className="flex items-center space-x-3 mb-6">
            <PaintBrushIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Appearance</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">
                Theme
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => {/* Light theme logic */}}
                  className={`flex items-center justify-center space-x-2 p-3 rounded-xl border transition-colors ${
                    theme === 'light' 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                      : 'border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <SunIcon className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm text-gray-900 dark:text-slate-100">Light</span>
                </button>
                
                <button
                  onClick={() => {/* Dark theme logic */}}
                  className={`flex items-center justify-center space-x-2 p-3 rounded-xl border transition-colors ${
                    theme === 'dark' 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                      : 'border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <MoonIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  <span className="text-sm text-gray-900 dark:text-slate-100">Dark</span>
                </button>
                
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center space-x-2 p-3 rounded-xl border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <ComputerDesktopIcon className="h-5 w-5 text-gray-600 dark:text-slate-400" />
                  <span className="text-sm text-gray-900 dark:text-slate-100">System</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Notification Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
        >
          <div className="flex items-center space-x-3 mb-6">
            <BellIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Notifications</h2>
          </div>
          
          <div className="space-y-4">
            {Object.entries(notifications).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-slate-100">
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {key === 'achievements' && 'Get notified when you unlock new achievements'}
                    {key === 'weeklyReport' && 'Receive weekly activity summaries'}
                    {key === 'systemUpdates' && 'System maintenance and update notifications'}
                    {key === 'emailDigest' && 'Daily email digest of your activity'}
                  </p>
                </div>
                <motion.button
                  onClick={() => handleNotificationChange(key as keyof typeof notifications)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    value ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'
                  }`}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      value ? 'translate-x-6' : 'translate-x-1'
                    }`}
                    layout
                  />
                </motion.button>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Preferences */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
        >
          <div className="flex items-center space-x-3 mb-6">
            <GlobeAltIcon className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Preferences</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Language
              </label>
              <select
                value={preferences.language}
                onChange={(e) => handlePreferenceChange('language', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Select language preference"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Timezone
              </label>
              <select
                value={preferences.timezone}
                onChange={(e) => handlePreferenceChange('timezone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Select timezone"
              >
                <option value="UTC">UTC</option>
                <option value="EST">Eastern Time</option>
                <option value="CST">Central Time</option>
                <option value="PST">Pacific Time</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Date Format
              </label>
              <select
                value={preferences.dateFormat}
                onChange={(e) => handlePreferenceChange('dateFormat', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Select date format"
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-slate-100">Auto Save</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Automatically save changes</p>
              </div>
              <motion.button
                onClick={() => handlePreferenceChange('autoSave', !preferences.autoSave)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  preferences.autoSave ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <motion.span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    preferences.autoSave ? 'translate-x-6' : 'translate-x-1'
                  }`}
                  layout
                />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Security Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700"
        >
          <div className="flex items-center space-x-3 mb-6">
            <ShieldCheckIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Security</h2>
          </div>
          
          <div className="space-y-4">
            <button className="w-full text-left p-3 border border-gray-300 dark:border-slate-600 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
              <h3 className="text-sm font-medium text-gray-900 dark:text-slate-100">Change Password</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">Update your account password</p>
            </button>
            
            <button className="w-full text-left p-3 border border-gray-300 dark:border-slate-600 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
              <h3 className="text-sm font-medium text-gray-900 dark:text-slate-100">Two-Factor Authentication</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">Add an extra layer of security</p>
            </button>
            
            <button className="w-full text-left p-3 border border-gray-300 dark:border-slate-600 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
              <h3 className="text-sm font-medium text-gray-900 dark:text-slate-100">Session Management</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">View and manage active sessions</p>
            </button>
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex justify-end"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
          >
            Save Changes
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default SettingsPage
