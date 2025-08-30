'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
import { useAuth } from '@/contexts/AuthContext'
import { useSeedApi, useUserApi, useNotificationsApi, useVoiceApi, useMascotApi } from '@/services/apiClient'
import type { MascotProfileDto } from '@/services/types/mascot'

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
  const [notifDevices, setNotifDevices] = useState<any[] | null>(null)
  const [notifHistory, setNotifHistory] = useState<any[] | null>(null)

  const { speak, suggest, celebrate, think, idle } = useMascot()
  const { isAuthenticated, logout, user, getAccessToken, recentAuthEvent } = useAuth()
  const { exportAccountData, deleteAccountData, deleteAccount, getProfile, createOrUpdateProfile, getSettings, updateSettings } = useUserApi()
  const { seedIfNeeded } = useSeedApi()
  const notificationsApi = useNotificationsApi()
  const voiceApi = useVoiceApi()
  const mascotApi = useMascotApi()

  // B2C token claims for display in Security section
  const [tokenClaims, setTokenClaims] = useState<Record<string, any> | null>(null)
  const [mascotProfile, setMascotProfile] = useState<MascotProfileDto | null>(null)

  const decodeJwt = useCallback((token: string) => {
    try {
      const parts = token.split('.')
      if (parts.length < 2) return null
      const payload = parts[1]
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
      return JSON.parse(json)
    } catch {
      return null
    }
  }, [])

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

  // Load user settings (from profile via generated client)
  useEffect(() => {
    if (!isAuthenticated) return

    const loadSettings = async () => {
      setLoading(true)
      think()

      try {
  const profile: any = await getProfile()
  const prefs: any = await getSettings()
        
        // Provide defaults for missing settings
        const defaultSettings: UserSettings = {
          displayName: profile?.name || 'User',
          email: profile?.email || '',
          avatar: profile?.avatar,
          bio: profile?.bio || '',
          timezone: prefs?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: prefs?.language || 'en',
          profileVisibility: prefs?.profileVisibility || 'private',
          dataSharing: prefs?.dataSharing ?? false,
          analyticsOptIn: prefs?.analyticsOptIn ?? true,
          searchHistory: prefs?.searchHistory ?? true,
          voiceEnabled: prefs?.voiceEnabled ?? true,
          wakeWord: prefs?.wakeWord || 'Hey Cortex',
          voiceLanguage: prefs?.voiceLanguage || 'en-US',
          voiceSpeed: prefs?.voiceSpeed ?? 1.0,
          voiceVolume: prefs?.voiceVolume ?? 0.8,
          microphoneSensitivity: prefs?.microphoneSensitivity ?? 0.7,
          continuousListening: prefs?.continuousListening ?? false,
          mascotEnabled: prefs?.mascotEnabled ?? true,
          mascotPersonality: prefs?.mascotPersonality || 'friendly',
          mascotAnimations: prefs?.mascotAnimations ?? true,
          mascotVoice: prefs?.mascotVoice ?? true,
          mascotProactivity: prefs?.mascotProactivity ?? 0.5,
          theme: prefs?.theme || 'auto',
          primaryColor: prefs?.primaryColor || '#7c3aed',
          fontSize: prefs?.fontSize || 'medium',
          reducedMotion: prefs?.reducedMotion ?? false,
          highContrast: prefs?.highContrast ?? false,
          emailNotifications: prefs?.emailNotifications ?? true,
          pushNotifications: prefs?.pushNotifications ?? true,
          achievementNotifications: prefs?.achievementNotifications ?? true,
          weeklyDigest: prefs?.weeklyDigest ?? true,
          maintenanceAlerts: prefs?.maintenanceAlerts ?? true,
          twoFactorEnabled: prefs?.twoFactorEnabled ?? false,
          loginAlerts: prefs?.loginAlerts ?? true,
          sessionTimeout: prefs?.sessionTimeout ?? 30,
          dataEncryption: prefs?.dataEncryption ?? true
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
  }, [isAuthenticated, speak, think, idle, getProfile, getSettings])

  // Load token claims only when viewing Security tab (avoids unnecessary work)
  useEffect(() => {
    if (!isAuthenticated || activeSection !== 'security' || tokenClaims) return
    let cancelled = false
    ;(async () => {
      const tok = await getAccessToken()
      if (!tok || cancelled) return
      const claims = decodeJwt(tok)
      if (!cancelled) setTokenClaims(claims)
    })()
    return () => { cancelled = true }
  }, [activeSection, decodeJwt, getAccessToken, isAuthenticated, tokenClaims])

  // Lazy-load mascot extras (quirks/history) when Mascot tab first shown
  useEffect(() => {
    if (!isAuthenticated || activeSection !== 'mascot') return
    if (mascotProfile) return
    let cancelled = false
    ;(async () => {
      try {
        const p = await mascotApi.getProfile()
        if (!cancelled) setMascotProfile(p)
      } catch (e) {
        console.warn('Failed to load mascot profile', e)
      }
    })()
    return () => { cancelled = true }
  }, [activeSection, isAuthenticated, mascotApi, mascotProfile])

  // Save settings (profile subset via generated client)
  const saveSettings = async () => {
    if (!settings) return

    setSaving(true)
    think()

    try {
      // Save profile subset
      await createOrUpdateProfile({
        email: settings.email,
        name: settings.displayName,
        bio: settings.bio,
        avatar: settings.avatar
      })
      // Save typed preferences
      await updateSettings({
        timezone: settings.timezone,
        language: settings.language,
        profileVisibility: settings.profileVisibility,
        dataSharing: settings.dataSharing,
        analyticsOptIn: settings.analyticsOptIn,
        searchHistory: settings.searchHistory,
        voiceEnabled: settings.voiceEnabled,
        wakeWord: settings.wakeWord,
        voiceLanguage: settings.voiceLanguage,
        voiceSpeed: settings.voiceSpeed,
        voiceVolume: settings.voiceVolume,
        microphoneSensitivity: settings.microphoneSensitivity,
        continuousListening: settings.continuousListening,
        mascotEnabled: settings.mascotEnabled,
        mascotPersonality: settings.mascotPersonality,
        mascotAnimations: settings.mascotAnimations,
        mascotVoice: settings.mascotVoice,
        mascotProactivity: settings.mascotProactivity,
        theme: settings.theme,
        primaryColor: settings.primaryColor,
        fontSize: settings.fontSize,
        reducedMotion: settings.reducedMotion,
        highContrast: settings.highContrast,
        emailNotifications: settings.emailNotifications,
        pushNotifications: settings.pushNotifications,
        achievementNotifications: settings.achievementNotifications,
        weeklyDigest: settings.weeklyDigest,
        maintenanceAlerts: settings.maintenanceAlerts,
        twoFactorEnabled: settings.twoFactorEnabled,
        loginAlerts: settings.loginAlerts,
        sessionTimeout: settings.sessionTimeout,
        dataEncryption: settings.dataEncryption,
      })
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

  // Save mascot-specific profile via dedicated endpoint (validates ranges/personality)
  const saveMascotProfile = useCallback(async () => {
    if (!settings) return
    think()
    try {
      const updated = await mascotApi.updateProfile({
        enabled: settings.mascotEnabled,
        personality: settings.mascotPersonality,
        animations: settings.mascotAnimations,
        voice: settings.mascotVoice,
        proactivity: settings.mascotProactivity,
      })
      setMascotProfile(updated)
  speak('Mascot saved and validated.', 'responding')
    } catch (e: any) {
      console.error('Failed to save mascot profile', e)
      speak(typeof e?.message === 'string' ? e.message : 'Failed to save mascot profile', 'error')
    } finally {
      idle()
    }
  }, [idle, mascotApi, settings, speak, think])

  // Update a specific setting
  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!settings) return
    
    setSettings(prev => prev ? { ...prev, [key]: value } : null)
  }

  // Handle dangerous actions
  const handleDangerousAction = useCallback((action: string, callback: () => void) => {
    setShowConfirmation(action)
    // Simulate confirmation dialog
    setTimeout(() => {
      if (confirm(`Are you sure you want to ${action}?`)) {
        callback()
        speak(`${action} completed.`, 'responding')
      }
      setShowConfirmation(null)
    }, 100)
  }, [speak])

  // Desktop notifications helper
  const enableDesktopNotifications = useCallback(async () => {
    think()
    try {
      if (typeof window === 'undefined' || typeof Notification === 'undefined') {
        speak('Desktop notifications are not supported in this environment.', 'error')
        return false
      }
      if (Notification.permission === 'granted') {
        speak('Desktop notifications are enabled.', 'responding')
        return true
      }
      if (Notification.permission === 'denied') {
        speak('Notifications are blocked in your browser settings.', 'error')
        return false
      }
      const result = await Notification.requestPermission()
      if (result === 'granted') {
        speak('Notifications enabled. We\'ll alert you here.', 'responding')
        return true
      } else {
        speak('Notifications permission was not granted.', 'error')
        return false
      }
    } finally {
      idle()
    }
  }, [idle, speak, think])

  const testDesktopNotification = useCallback(() => {
    try {
      if (typeof window === 'undefined' || typeof Notification === 'undefined') return
      if (Notification.permission === 'granted') {
        new Notification('Cortex', { body: 'Notifications are working.' })
      } else {
        speak('Please enable notifications first.', 'error')
      }
    } catch {
      // ignore
    }
  }, [speak])

  // Server-side notification helpers
  const sendServerTestNotification = useCallback(async () => {
    think()
    try {
      await notificationsApi.sendTest({ title: 'Cortex Test', message: 'Server test notification delivered.', type: 'test' })
      speak('Test notification request sent.', 'responding')
    } catch (e) {
      console.error('Server test notification failed', e)
      speak('Failed to send test notification.', 'error')
    } finally {
      idle()
    }
  }, [idle, notificationsApi, speak, think])

  const triggerWeeklyDigest = useCallback(async () => {
    think()
    try {
      await notificationsApi.triggerWeeklyDigest()
      speak('Weekly digest triggered.', 'responding')
    } catch (e) {
      console.error('Weekly digest trigger failed', e)
      speak('Failed to trigger weekly digest.', 'error')
    } finally {
      idle()
    }
  }, [idle, notificationsApi, speak, think])

  // Voice helpers
  const validateVoiceConfig = useCallback(async () => {
    if (!settings) return
    think()
    try {
      const res = await voiceApi.validateConfig({
        voiceLanguage: settings.voiceLanguage,
        voiceSpeed: settings.voiceSpeed,
        voiceVolume: settings.voiceVolume,
        microphoneSensitivity: settings.microphoneSensitivity,
        continuousListening: settings.continuousListening,
        wakeWord: settings.wakeWord,
      })
      if (res.isValid) speak('Voice settings look good.', 'responding')
      else speak('Voice settings need attention. Check warnings.', 'error')
    } catch (e) {
      console.error('Voice validation failed', e)
      speak('Failed to validate voice settings.', 'error')
    } finally {
      idle()
    }
  }, [idle, settings, speak, think, voiceApi])

  const playVoiceTest = useCallback(async () => {
    think()
    try {
      const blob = await voiceApi.ttsTest()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.play().catch(() => {/* ignore */})
      speak('Playing test speech.', 'responding')
    } catch (e) {
      console.error('TTS test failed', e)
      speak('Failed to play test speech.', 'error')
    } finally {
      idle()
    }
  }, [idle, speak, think, voiceApi])

  // Lazy-load notifications devices/history when notifications tab first shown
  useEffect(() => {
    let cancelled = false
    if (activeSection !== 'notifications' || !isAuthenticated) return
    if (notifDevices && notifHistory) return
    ;(async () => {
      try {
        const [devices, history] = await Promise.all([
          notificationsApi.listDevices().catch(() => []),
          notificationsApi.getHistory(10, 0).then(h => h?.notifications ?? []).catch(() => []),
        ])
        if (!cancelled) {
          setNotifDevices(devices || [])
          setNotifHistory(history || [])
        }
      } catch {
        // ignore
      }
    })()
    return () => { cancelled = true }
  }, [activeSection, isAuthenticated, notifDevices, notifHistory, notificationsApi])

  // System helpers
  const clearLocalCaches = useCallback(async () => {
    think()
    try {
      localStorage.clear()
      sessionStorage.clear()
      // Try to clear CacheStorage if available
      const cs = (globalThis as Window & typeof globalThis).caches
      if (cs && 'keys' in cs) {
        const keys = await cs.keys()
        await Promise.all(keys.map((k) => cs.delete(k)))
      }
      speak('Local cache cleared.', 'responding')
    } catch (e) {
      console.error('Failed to clear caches', e)
      speak('Failed to clear cache.', 'error')
    } finally {
      idle()
    }
  }, [idle, speak, think])

  // Account actions
  const onExportData = useCallback(async () => {
    try {
      think()
      const data = await exportAccountData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cortex-account-export-${new Date().toISOString().slice(0,10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      speak('Your data export is ready and downloading.', 'responding')
    } catch (e) {
      console.error('Export failed', e)
      speak('Failed to export account data. Please try again.', 'error')
    } finally {
      idle()
    }
  }, [exportAccountData, idle, speak, think])

  const onDeleteAccountData = useCallback(async () => {
    handleDangerousAction('delete your account data (keep account)', async () => {
      try {
        think()
        await deleteAccountData()
        celebrate()
        speak('All your data has been deleted. Your account remains active.', 'responding')
      } catch (e) {
        console.error('Delete data failed', e)
        speak('Failed to delete your data. Please try again.', 'error')
      } finally {
        idle()
      }
    })
  }, [celebrate, deleteAccountData, handleDangerousAction, idle, speak, think])

  const onDeleteAccount = useCallback(async () => {
    handleDangerousAction('delete your account permanently', async () => {
      try {
        think()
        await deleteAccount()
  celebrate()
  speak('Your account has been deleted. We hope to see you again.', 'responding')
  // Sign out and redirect instead of reload
  setTimeout(() => { logout() }, 600)
      } catch (e) {
        console.error('Delete account failed', e)
        speak('Failed to delete your account. Please try again.', 'error')
      } finally {
        idle()
      }
    })
  }, [celebrate, deleteAccount, handleDangerousAction, idle, logout, speak, think])

  const onSeedDemoData = useCallback(async () => {
    try {
      think()
      await seedIfNeeded()
      celebrate()
      speak('Demo data has been created. Check your notes and analytics!', 'responding')
    } catch (e) {
      console.error('Seed data failed', e)
      speak('Failed to create demo data. Please try again.', 'error')
    } finally {
      idle()
    }
  }, [celebrate, idle, seedIfNeeded, speak, think])

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

                  {/* Danger Zone */}
                  <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Danger Zone</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="p-4 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-900/20">
                        <h4 className="font-medium text-indigo-900 dark:text-indigo-300 mb-2">Seed Demo Data</h4>
                        <p className="text-sm text-indigo-800 dark:text-indigo-400 mb-3">Populate your workspace with sample content to explore features.</p>
                        <button
                          onClick={onSeedDemoData}
                          className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                        >
                          Seed Data
                        </button>
                      </div>
                      <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Export Account Data</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Download your profile, notes, classifications, and achievements as JSON.</p>
                        <button
                          onClick={onExportData}
                          className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                        >
                          Export Data
                        </button>
                      </div>
                      <div className="p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-900/20">
                        <h4 className="font-medium text-red-800 dark:text-red-300 mb-2">Delete Account Data</h4>
                        <p className="text-sm text-red-700 dark:text-red-400 mb-3">Remove all your content. Your account stays so you can start fresh.</p>
                        <button
                          onClick={onDeleteAccountData}
                          className="w-full px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                        >
                          Delete Data
                        </button>
                      </div>
                      <div className="p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-900/20">
                        <h4 className="font-medium text-red-800 dark:text-red-300 mb-2">Delete Account</h4>
                        <p className="text-sm text-red-700 dark:text-red-400 mb-3">Permanently delete your account and all associated data.</p>
                        <button
                          onClick={onDeleteAccount}
                          className="w-full px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white transition-colors"
                        >
                          Delete Account
                        </button>
                      </div>
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
                    <div className="flex items-center gap-3 mt-4">
                      <button onClick={validateVoiceConfig} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100">Validate settings</button>
                      <button onClick={playVoiceTest} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100">Play test voice</button>
                    </div>
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
              {/* Privacy */}
              {activeSection === 'privacy' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Privacy</h2>
                    <p className="text-gray-600 dark:text-gray-400">Control how your data is used and who can see your profile</p>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Profile Visibility</label>
                      <div className="flex gap-3">
                        {(['public', 'friends', 'private'] as const).map(v => (
                          <button
                            key={v}
                            onClick={() => updateSetting('profileVisibility', v)}
                            className={`px-4 py-2 rounded-lg border-2 capitalize transition-colors ${
                              settings.profileVisibility === v
                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                                : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Data Sharing</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Allow anonymized usage data to improve features</p>
                      </div>
                      <button
                        onClick={() => updateSetting('dataSharing', !settings.dataSharing)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.dataSharing ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={`Toggle data sharing ${settings.dataSharing ? 'off' : 'on'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.dataSharing ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Analytics</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Opt in to product analytics</p>
                      </div>
                      <button
                        onClick={() => updateSetting('analyticsOptIn', !settings.analyticsOptIn)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.analyticsOptIn ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={`Toggle analytics ${settings.analyticsOptIn ? 'off' : 'on'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.analyticsOptIn ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Search History</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Save searches to improve suggestions</p>
                      </div>
                      <button
                        onClick={() => updateSetting('searchHistory', !settings.searchHistory)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.searchHistory ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={`Toggle search history ${settings.searchHistory ? 'off' : 'on'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.searchHistory ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications */}
              {activeSection === 'notifications' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Notifications</h2>
                    <p className="text-gray-600 dark:text-gray-400">Choose how you want to be notified. Desktop notifications only for now.</p>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Email Notifications</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Receive important updates via email</p>
                      </div>
                      <button
                        onClick={() => updateSetting('emailNotifications', !settings.emailNotifications)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.emailNotifications ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={`Toggle email notifications ${settings.emailNotifications ? 'off' : 'on'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotifications ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Desktop Notifications</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Show alerts on your device</p>
                      </div>
                      <button
                        onClick={async () => {
                          if (!settings.pushNotifications) {
                            const ok = await enableDesktopNotifications()
                            if (ok) updateSetting('pushNotifications', true)
                          } else {
                            updateSetting('pushNotifications', false)
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.pushNotifications ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={`Toggle desktop notifications ${settings.pushNotifications ? 'off' : 'on'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.pushNotifications ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Achievements</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-400">Alerts for new achievements</p>
                        </div>
                        <button
                          onClick={() => updateSetting('achievementNotifications', !settings.achievementNotifications)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            settings.achievementNotifications ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                          aria-label={`Toggle achievement notifications ${settings.achievementNotifications ? 'off' : 'on'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.achievementNotifications ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Weekly Digest</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-400">Summary email every week</p>
                        </div>
                        <button
                          onClick={() => updateSetting('weeklyDigest', !settings.weeklyDigest)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            settings.weeklyDigest ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                          aria-label={`Toggle weekly digest ${settings.weeklyDigest ? 'off' : 'on'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.weeklyDigest ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Maintenance Alerts</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-400">Downtime and update notices</p>
                        </div>
                        <button
                          onClick={() => updateSetting('maintenanceAlerts', !settings.maintenanceAlerts)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            settings.maintenanceAlerts ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                          aria-label={`Toggle maintenance alerts ${settings.maintenanceAlerts ? 'off' : 'on'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.maintenanceAlerts ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        onClick={testDesktopNotification}
                        className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                      >
                        Browser test notification
                      </button>
                      <button
                        onClick={sendServerTestNotification}
                        className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                      >
                        Server test notification
                      </button>
                      <button
                        onClick={triggerWeeklyDigest}
                        className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                      >
                        Trigger weekly digest
                      </button>
                    </div>

                    {(notifDevices?.length || notifHistory?.length) ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                          <h4 className="text-sm font-medium mb-2 text-gray-900 dark:text-white">Registered devices</h4>
                          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 max-h-40 overflow-auto">
                            {(notifDevices || []).map((d, i) => (
                              <li key={d.deviceId || i} className="flex justify-between gap-3">
                                <span className="truncate">{d.deviceName || d.deviceType || 'device'}</span>
                                <span className="opacity-70">{d.isActive ? 'active' : 'inactive'}</span>
                              </li>
                            ))}
                            {(!notifDevices || notifDevices.length === 0) && <li className="opacity-70">No devices</li>}
                          </ul>
                        </div>
                        <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                          <h4 className="text-sm font-medium mb-2 text-gray-900 dark:text-white">Recent notifications</h4>
                          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 max-h-40 overflow-auto">
                            {(notifHistory || []).map((n: any, i) => (
                              <li key={n.id || i} className="flex justify-between gap-3">
                                <span className="truncate">{n.title || n.Title || n.type || 'notification'}</span>
                                <span className="opacity-70">{n.status || n.Status || ''}</span>
                              </li>
                            ))}
                            {(!notifHistory || notifHistory.length === 0) && <li className="opacity-70">No recent notifications</li>}
                          </ul>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Security */}
              {activeSection === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Security</h2>
                    <p className="text-gray-600 dark:text-gray-400">Protect your account and data</p>
                  </div>

                  {/* Azure AD B2C details */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Azure AD B2C Session</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">User</div>
                        <div className="font-mono text-gray-900 dark:text-gray-100 break-all">{user?.name || 'N/A'}</div>
                        <div className="font-mono text-gray-600 dark:text-gray-300 break-all">{user?.username || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">Home Account Id</div>
                        <div className="font-mono text-gray-900 dark:text-gray-100 break-all">{user?.homeAccountId || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">Issuer (iss)</div>
                        <div className="font-mono text-gray-900 dark:text-gray-100 break-all">{tokenClaims?.iss || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">Tenant (tid)</div>
                        <div className="font-mono text-gray-900 dark:text-gray-100 break-all">{tokenClaims?.tid || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">Object Id (oid) / Sub</div>
                        <div className="font-mono text-gray-900 dark:text-gray-100 break-all">{tokenClaims?.oid || tokenClaims?.sub || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">Policy (tfp/acr)</div>
                        <div className="font-mono text-gray-900 dark:text-gray-100 break-all">{tokenClaims?.tfp || tokenClaims?.acr || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">Audience (aud)</div>
                        <div className="font-mono text-gray-900 dark:text-gray-100 break-all">{tokenClaims?.aud || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">Expires (exp)</div>
                        <div className="font-mono text-gray-900 dark:text-gray-100 break-all">{tokenClaims?.exp ? new Date(tokenClaims.exp * 1000).toLocaleString() : 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">Recent Auth Event</div>
                        <div className="font-mono text-gray-900 dark:text-gray-100 break-all">{recentAuthEvent || 'N/A'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Two-Factor Authentication</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Add an extra layer of security</p>
                      </div>
                      <button
                        onClick={() => updateSetting('twoFactorEnabled', !settings.twoFactorEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.twoFactorEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={`Toggle two factor ${settings.twoFactorEnabled ? 'off' : 'on'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.twoFactorEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Login Alerts</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Email you when a new device logs in</p>
                      </div>
                      <button
                        onClick={() => updateSetting('loginAlerts', !settings.loginAlerts)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.loginAlerts ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={`Toggle login alerts ${settings.loginAlerts ? 'off' : 'on'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.loginAlerts ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div>
                      <label htmlFor="session-timeout" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Session Timeout (minutes)</label>
                      <input
                        id="session-timeout"
                        type="number"
                        min={5}
                        max={240}
                        value={settings.sessionTimeout}
                        onChange={(e) => updateSetting('sessionTimeout', Math.max(5, Math.min(240, parseInt(e.target.value || '0', 10))))}
                        className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        title="Minutes before your session automatically signs out"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Data Encryption</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Encrypt data at rest in your browser</p>
                      </div>
                      <button
                        onClick={() => updateSetting('dataEncryption', !settings.dataEncryption)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.dataEncryption ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={`Toggle data encryption ${settings.dataEncryption ? 'off' : 'on'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.dataEncryption ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* System */}
              {activeSection === 'system' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">System</h2>
                    <p className="text-gray-600 dark:text-gray-400">Tools and maintenance</p>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Clear Local Cache</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Remove cached data and preferences</p>
                      </div>
                      <button
                        onClick={clearLocalCaches}
                        className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                      >
                        Clear cache
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Check for Updates</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Make sure you have the latest features</p>
                      </div>
                      <button
                        onClick={() => speak('You\'re up to date.', 'responding')}
                        className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                      >
                        Check
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Reload Application</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Apply pending changes immediately</p>
                      </div>
                      <button
                        onClick={() => typeof window !== 'undefined' && window.location.reload()}
                        className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                      >
                        Reload
                      </button>
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
