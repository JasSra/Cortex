'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserIcon,
  ShieldCheckIcon,
  BellIcon,
  EyeIcon,
  CogIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  PaintBrushIcon,
  GlobeAltIcon,
  KeyIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  SunIcon,
  MoonIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { useMascot } from '@/contexts/MascotContext'
import { useAppAuth } from '@/hooks/useAppAuth'
import { useAuth } from '@/contexts/AuthContext'

interface UserSettings {
  // Account settings
  displayName: string
  email: string
  avatar?: string
  bio?: string
  timezone: string
  language: string

  // Privacy settings
  profileVisibility: 'public' | 'private' | 'friends'
  dataSharing: boolean
  analyticsOptIn: boolean
  searchHistory: boolean

  // Voice settings
  voiceEnabled: boolean
  wakeWord: string
  voiceLanguage: string
  voiceSpeed: number
  voiceVolume: number
  microphoneSensitivity: number
  continuousListening: boolean

  // Mascot settings
  mascotEnabled: boolean
  mascotPersonality: 'friendly' | 'professional' | 'playful' | 'minimal'
  mascotAnimations: boolean
  mascotVoice: boolean
  mascotProactivity: number

  // Appearance settings
  theme: 'light' | 'dark' | 'auto'
  primaryColor: string
  fontSize: 'small' | 'medium' | 'large'
  reducedMotion: boolean
  highContrast: boolean

  // Notification settings
  emailNotifications: boolean
  pushNotifications: boolean
  achievementNotifications: boolean
  weeklyDigest: boolean
  maintenanceAlerts: boolean

  // Security settings
  twoFactorEnabled: boolean
  loginAlerts: boolean
  sessionTimeout: number
  dataEncryption: boolean
}

interface SettingsSection {
  id: string
  title: string
  description: string
  icon: React.ReactNode
}

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [activeSection, setActiveSection] = useState<string>('account')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedRecently, setSavedRecently] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState<string | null>(null)

  const { speak, suggest, celebrate, think, idle } = useMascot()
  const { getAccessToken } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  const { isAuthenticated } = useAuth()

  const sections: SettingsSection[] = [
    {
      id: 'account',
      title: 'Account',
      description: 'Personal information and preferences',
      icon: <UserIcon className="w-5 h-5" />
    },
    {
      id: 'privacy',
      title: 'Privacy',
      description: 'Data sharing and visibility controls',
      icon: <ShieldCheckIcon className="w-5 h-5" />
    },
    {
      id: 'voice',
      title: 'Voice Assistant',
      description: 'Voice commands and audio settings',
      icon: <MicrophoneIcon className="w-5 h-5" />
    },
    {
      id: 'mascot',
      title: 'Mascot',
      description: 'Customize your AI companion',
      icon: <PaintBrushIcon className="w-5 h-5" />
    },
    {
      id: 'appearance',
      title: 'Appearance',
      description: 'Theme, colors, and accessibility',
      icon: <EyeIcon className="w-5 h-5" />
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Email, push, and alert preferences',
      icon: <BellIcon className="w-5 h-5" />
    },
    {
      id: 'security',
      title: 'Security',
      description: 'Authentication and data protection',
      icon: <KeyIcon className="w-5 h-5" />
    },
    {
      id: 'system',
      title: 'System',
      description: 'Performance and advanced options',
      icon: <CogIcon className="w-5 h-5" />
    }
  ]

  // Load user settings
  useEffect(() => {
    if (!isAuthenticated) return

    const loadSettings = async () => {
      setLoading(true)
      think()

      try {
        const token = await getAccessToken()
        const headers = new Headers({ 'Content-Type': 'application/json' })
        if (token) headers.set('Authorization', `Bearer ${token}`)
        const response: any = await fetch(`${baseUrl}/api/user/settings`, { headers }).then(r => r.ok ? r.json() : {})
        
        // Provide defaults for missing settings
        const defaultSettings: UserSettings = {
          displayName: response.displayName || 'User',
          email: response.email || '',
          avatar: response.avatar,
          bio: response.bio || '',
          timezone: response.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: response.language || 'en',
          profileVisibility: response.profileVisibility || 'private',
          dataSharing: response.dataSharing ?? false,
          analyticsOptIn: response.analyticsOptIn ?? true,
          searchHistory: response.searchHistory ?? true,
          voiceEnabled: response.voiceEnabled ?? true,
          wakeWord: response.wakeWord || 'Hey Cortex',
          voiceLanguage: response.voiceLanguage || 'en-US',
          voiceSpeed: response.voiceSpeed ?? 1.0,
          voiceVolume: response.voiceVolume ?? 0.8,
          microphoneSensitivity: response.microphoneSensitivity ?? 0.7,
          continuousListening: response.continuousListening ?? false,
          mascotEnabled: response.mascotEnabled ?? true,
          mascotPersonality: response.mascotPersonality || 'friendly',
          mascotAnimations: response.mascotAnimations ?? true,
          mascotVoice: response.mascotVoice ?? true,
          mascotProactivity: response.mascotProactivity ?? 0.5,
          theme: response.theme || 'auto',
          primaryColor: response.primaryColor || '#7c3aed',
          fontSize: response.fontSize || 'medium',
          reducedMotion: response.reducedMotion ?? false,
          highContrast: response.highContrast ?? false,
          emailNotifications: response.emailNotifications ?? true,
          pushNotifications: response.pushNotifications ?? true,
          achievementNotifications: response.achievementNotifications ?? true,
          weeklyDigest: response.weeklyDigest ?? true,
          maintenanceAlerts: response.maintenanceAlerts ?? true,
          twoFactorEnabled: response.twoFactorEnabled ?? false,
          loginAlerts: response.loginAlerts ?? true,
          sessionTimeout: response.sessionTimeout ?? 30,
          dataEncryption: response.dataEncryption ?? true
        }

        setSettings(defaultSettings)
        speak('Settings loaded successfully! Feel free to customize your experience.')

      } catch (error) {
        console.error('Failed to load settings:', error)
        speak('Failed to load your settings. Using defaults for now.', 'error')
        
        // Provide complete default settings even on error
        setSettings({
          displayName: 'User',
          email: '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: 'en',
          profileVisibility: 'private',
          dataSharing: false,
          analyticsOptIn: true,
          searchHistory: true,
          voiceEnabled: true,
          wakeWord: 'Hey Cortex',
          voiceLanguage: 'en-US',
          voiceSpeed: 1.0,
          voiceVolume: 0.8,
          microphoneSensitivity: 0.7,
          continuousListening: false,
          mascotEnabled: true,
          mascotPersonality: 'friendly',
          mascotAnimations: true,
          mascotVoice: true,
          mascotProactivity: 0.5,
          theme: 'auto',
          primaryColor: '#7c3aed',
          fontSize: 'medium',
          reducedMotion: false,
          highContrast: false,
          emailNotifications: true,
          pushNotifications: true,
          achievementNotifications: true,
          weeklyDigest: true,
          maintenanceAlerts: true,
          twoFactorEnabled: false,
          loginAlerts: true,
          sessionTimeout: 30,
          dataEncryption: true
        })
      } finally {
        setLoading(false)
        idle()
      }
    }

    loadSettings()
  }, [isAuthenticated, speak, think, idle, getAccessToken])

  // Save settings
  const saveSettings = async () => {
    if (!settings) return

    setSaving(true)
    think()

    try {
      const token = await getAccessToken()
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (token) headers.set('Authorization', `Bearer ${token}`)
      await fetch(`${baseUrl}/api/user/settings`, { method: 'PUT', headers, body: JSON.stringify(settings) })
      setSavedRecently(true)
      celebrate()
      speak('Settings saved successfully!', 'responding')
      
      setTimeout(() => setSavedRecently(false), 3000)
    } catch (error) {
      console.error('Failed to save settings:', error)
      speak('Failed to save settings. Please try again.', 'error')
    } finally {
      setSaving(false)
      idle()
    }
  }

  // Update a specific setting
  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!settings) return
    
    setSettings(prev => prev ? { ...prev, [key]: value } : null)
  }

  // Handle dangerous actions
  const handleDangerousAction = (action: string, callback: () => void) => {
    setShowConfirmation(action)
    // Simulate confirmation dialog
    setTimeout(() => {
      if (confirm(`Are you sure you want to ${action}?`)) {
        callback()
        speak(`${action} completed.`, 'responding')
      }
      setShowConfirmation(null)
    }, 100)
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400">Please sign in to access settings</p>
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

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400">Failed to load settings</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-screen">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">Customize your experience</p>
          </div>
          
          <nav className="px-4 space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeSection === section.id
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {section.icon}
                <div>
                  <p className="font-medium">{section.title}</p>
                  <p className="text-xs opacity-75">{section.description}</p>
                </div>
              </button>
            ))}
          </nav>

          {/* Save Button */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 mt-auto">
            <motion.button
              onClick={saveSettings}
              disabled={saving}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                savedRecently
                  ? 'bg-green-600 text-white'
                  : saving
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {saving ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
              ) : savedRecently ? (
                <CheckIcon className="w-4 h-4" />
              ) : null}
              {saving ? 'Saving...' : savedRecently ? 'Saved!' : 'Save Changes'}
            </motion.button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl"
            >
              {/* Account Settings */}
              {activeSection === 'account' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Account Settings</h2>
                    <p className="text-gray-600 dark:text-gray-400">Manage your personal information and preferences</p>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Profile Information</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={settings.displayName}
                          onChange={(e) => updateSetting('displayName', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          title="Enter your display name"
                          aria-label="Display name input"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={settings.email}
                          onChange={(e) => updateSetting('email', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          title="Enter your email address"
                          aria-label="Email address input"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Timezone
                        </label>
                        <select
                          value={settings.timezone}
                          onChange={(e) => updateSetting('timezone', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          title="Select your timezone"
                          aria-label="Timezone selection"
                        >
                          <option value="America/New_York">Eastern Time</option>
                          <option value="America/Chicago">Central Time</option>
                          <option value="America/Denver">Mountain Time</option>
                          <option value="America/Los_Angeles">Pacific Time</option>
                          <option value="UTC">UTC</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Language
                        </label>
                        <select
                          value={settings.language}
                          onChange={(e) => updateSetting('language', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          title="Select your language"
                          aria-label="Language selection"
                        >
                          <option value="en">English</option>
                          <option value="es">Spanish</option>
                          <option value="fr">French</option>
                          <option value="de">German</option>
                          <option value="zh">Chinese</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-6">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Bio
                      </label>
                      <textarea
                        value={settings.bio}
                        onChange={(e) => updateSetting('bio', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="Tell us about yourself..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Voice Settings */}
              {activeSection === 'voice' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Voice Assistant</h2>
                    <p className="text-gray-600 dark:text-gray-400">Configure voice commands and audio preferences</p>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Enable Voice Assistant</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Allow voice commands throughout the application</p>
                      </div>
                      <button
                        onClick={() => updateSetting('voiceEnabled', !settings.voiceEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.voiceEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        title={`${settings.voiceEnabled ? 'Disable' : 'Enable'} voice assistant`}
                        aria-label={`Toggle voice assistant ${settings.voiceEnabled ? 'off' : 'on'}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.voiceEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {settings.voiceEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-6"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Wake Word
                            </label>
                            <input
                              type="text"
                              value={settings.wakeWord}
                              onChange={(e) => updateSetting('wakeWord', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              title="Set your wake word for voice activation"
                              aria-label="Wake word input"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Voice Language
                            </label>
                            <select
                              value={settings.voiceLanguage}
                              onChange={(e) => updateSetting('voiceLanguage', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              title="Select voice language"
                              aria-label="Voice language selection"
                            >
                              <option value="en-US">English (US)</option>
                              <option value="en-GB">English (UK)</option>
                              <option value="es-ES">Spanish</option>
                              <option value="fr-FR">French</option>
                              <option value="de-DE">German</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Voice Speed: {settings.voiceSpeed.toFixed(1)}x
                            </label>
                            <input
                              type="range"
                              min="0.5"
                              max="2"
                              step="0.1"
                              value={settings.voiceSpeed}
                              onChange={(e) => updateSetting('voiceSpeed', parseFloat(e.target.value))}
                              className="w-full"
                              title={`Voice speed: ${settings.voiceSpeed.toFixed(1)}x`}
                              aria-label={`Voice speed slider, current value: ${settings.voiceSpeed.toFixed(1)}x`}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Voice Volume: {Math.round(settings.voiceVolume * 100)}%
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={settings.voiceVolume}
                              onChange={(e) => updateSetting('voiceVolume', parseFloat(e.target.value))}
                              className="w-full"
                              title={`Voice volume: ${Math.round(settings.voiceVolume * 100)}%`}
                              aria-label={`Voice volume slider, current value: ${Math.round(settings.voiceVolume * 100)}%`}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Microphone Sensitivity: {Math.round(settings.microphoneSensitivity * 100)}%
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={settings.microphoneSensitivity}
                              onChange={(e) => updateSetting('microphoneSensitivity', parseFloat(e.target.value))}
                              className="w-full"
                              title={`Microphone sensitivity: ${Math.round(settings.microphoneSensitivity * 100)}%`}
                              aria-label={`Microphone sensitivity slider, current value: ${Math.round(settings.microphoneSensitivity * 100)}%`}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Continuous Listening</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Always listen for voice commands</p>
                          </div>
                          <button
                            onClick={() => updateSetting('continuousListening', !settings.continuousListening)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              settings.continuousListening ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            title={`${settings.continuousListening ? 'Disable' : 'Enable'} continuous listening`}
                            aria-label={`Toggle continuous listening ${settings.continuousListening ? 'off' : 'on'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                settings.continuousListening ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              )}

              {/* Mascot Settings */}
              {activeSection === 'mascot' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Mascot Companion</h2>
                    <p className="text-gray-600 dark:text-gray-400">Customize your AI companion&apos;s behavior and appearance</p>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Enable Mascot</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Show your AI companion throughout the app</p>
                      </div>
                      <button
                        onClick={() => updateSetting('mascotEnabled', !settings.mascotEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.mascotEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        title={`${settings.mascotEnabled ? 'Disable' : 'Enable'} mascot companion`}
                        aria-label={`Toggle mascot ${settings.mascotEnabled ? 'off' : 'on'}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.mascotEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {settings.mascotEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-6"
                      >
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Personality
                          </label>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {(['friendly', 'professional', 'playful', 'minimal'] as const).map((personality) => (
                              <button
                                key={personality}
                                onClick={() => updateSetting('mascotPersonality', personality)}
                                className={`p-3 rounded-lg border-2 transition-colors capitalize ${
                                  settings.mascotPersonality === personality
                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                                }`}
                              >
                                {personality}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Animations</h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400">Enable mascot animations and expressions</p>
                            </div>
                            <button
                              onClick={() => updateSetting('mascotAnimations', !settings.mascotAnimations)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                settings.mascotAnimations ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                              title={`${settings.mascotAnimations ? 'Disable' : 'Enable'} mascot animations`}
                              aria-label={`Toggle mascot animations ${settings.mascotAnimations ? 'off' : 'on'}`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  settings.mascotAnimations ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Voice Responses</h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400">Allow mascot to speak and provide audio feedback</p>
                            </div>
                            <button
                              onClick={() => updateSetting('mascotVoice', !settings.mascotVoice)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                settings.mascotVoice ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                              title={`${settings.mascotVoice ? 'Disable' : 'Enable'} mascot voice responses`}
                              aria-label={`Toggle mascot voice ${settings.mascotVoice ? 'off' : 'on'}`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  settings.mascotVoice ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Proactivity: {Math.round(settings.mascotProactivity * 100)}%
                            </label>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                              How often the mascot provides suggestions and tips
                            </p>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={settings.mascotProactivity}
                              onChange={(e) => updateSetting('mascotProactivity', parseFloat(e.target.value))}
                              className="w-full"
                              title={`Mascot proactivity: ${Math.round(settings.mascotProactivity * 100)}%`}
                              aria-label={`Mascot proactivity slider, current value: ${Math.round(settings.mascotProactivity * 100)}%`}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              )}

              {/* Appearance Settings */}
              {activeSection === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Appearance</h2>
                    <p className="text-gray-600 dark:text-gray-400">Customize the look and feel of your workspace</p>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Theme
                        </label>
                        <div className="flex gap-3">
                          {(['light', 'dark', 'auto'] as const).map((theme) => (
                            <button
                              key={theme}
                              onClick={() => updateSetting('theme', theme)}
                              className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors capitalize ${
                                settings.theme === theme
                                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                                  : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                              }`}
                            >
                              {theme === 'light' && <SunIcon className="w-4 h-4" />}
                              {theme === 'dark' && <MoonIcon className="w-4 h-4" />}
                              {theme === 'auto' && <ComputerDesktopIcon className="w-4 h-4" />}
                              {theme}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Font Size
                        </label>
                        <div className="flex gap-3">
                          {(['small', 'medium', 'large'] as const).map((size) => (
                            <button
                              key={size}
                              onClick={() => updateSetting('fontSize', size)}
                              className={`px-4 py-3 rounded-lg border-2 transition-colors capitalize ${
                                settings.fontSize === size
                                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                                  : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                              }`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Reduced Motion</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Minimize animations for accessibility</p>
                          </div>
                          <button
                            onClick={() => updateSetting('reducedMotion', !settings.reducedMotion)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              settings.reducedMotion ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            title={`${settings.reducedMotion ? 'Disable' : 'Enable'} reduced motion`}
                            aria-label={`Toggle reduced motion ${settings.reducedMotion ? 'off' : 'on'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                settings.reducedMotion ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white">High Contrast</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Increase contrast for better visibility</p>
                          </div>
                          <button
                            onClick={() => updateSetting('highContrast', !settings.highContrast)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              settings.highContrast ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            title={`${settings.highContrast ? 'Disable' : 'Enable'} high contrast`}
                            aria-label={`Toggle high contrast ${settings.highContrast ? 'off' : 'on'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                settings.highContrast ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Other sections placeholder */}
              {!['account', 'voice', 'mascot', 'appearance'].includes(activeSection) && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {sections.find(s => s.id === activeSection)?.title}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      {sections.find(s => s.id === activeSection)?.description}
                    </p>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <div className="text-center py-12">
                      <CogIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Coming Soon</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        This settings section is under development. Check back soon!
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Success Toast */}
      <AnimatePresence>
        {savedRecently && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-4 left-1/2 transform bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50"
          >
            <div className="flex items-center gap-2">
              <CheckIcon className="w-5 h-5" />
              <span>Settings saved successfully!</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SettingsPage
