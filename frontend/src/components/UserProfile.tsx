'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth, getUserDisplayName, getUserInitials } from '../contexts/AuthContext'
import { NotificationService, MascotService, VoiceService } from '../services'
import { CortexApiClient, NotificationPreferences, UpdateMascotProfileRequest } from '../api/cortex-api-client'
import { 
  UserIcon, 
  BellIcon, 
  SpeakerWaveIcon, 
  ChatBubbleLeftRightIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

interface VoiceSettings {
  voiceLanguage: string
  voiceSpeed: number
  voiceVolume: number
  microphoneSensitivity: number
  continuousListening: boolean
  wakeWord: string
}

export function UserProfile() {
  const { user, isAuthenticated } = useAuth()
  const [activeTab, setActiveTab] = useState('profile')
  const [notificationSettings, setNotificationSettings] = useState<NotificationPreferences>(new NotificationPreferences())
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    voiceLanguage: 'en-US',
    voiceSpeed: 1.0,
    voiceVolume: 0.8,
    microphoneSensitivity: 0.5,
    continuousListening: false,
    wakeWord: 'cortex'
  })
  const [mascotPersonality, setMascotPersonality] = useState('friendly')
  const [mascotProactivity, setMascotProactivity] = useState(5)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{type: 'success' | 'error' | 'warning', text: string} | null>(null)

  // Services
  const client = useMemo(() => new CortexApiClient(), [])
  const notificationService = useMemo(() => new NotificationService(client), [client])
  const mascotService = useMemo(() => new MascotService(client), [client])
  const voiceService = useMemo(() => new VoiceService(client), [client])

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      
      // Load notification preferences
      try {
        const prefs = await notificationService.getPreferences()
        setNotificationSettings(prefs)
      } catch (error) {
        console.warn('Failed to load notification preferences:', error)
      }

      // Load mascot profile
      try {
        const profile = await mascotService.getProfile()
        if (profile) {
          setMascotPersonality(profile.personality || 'friendly')
          setMascotProactivity(profile.proactivity || 5)
        }
      } catch (error) {
        console.warn('Failed to load mascot profile:', error)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setLoading(false)
    }
  }, [notificationService, mascotService])

  useEffect(() => {
    if (isAuthenticated) {
      loadSettings()
    }
  }, [isAuthenticated, loadSettings])

  const saveNotificationSettings = async () => {
    try {
      setLoading(true)
      await notificationService.updatePreferences(notificationSettings)
      setMessage({ type: 'success', text: 'Notification settings saved successfully!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save notification settings' })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setLoading(false)
    }
  }

  const saveMascotSettings = async () => {
    try {
      setLoading(true)
      await mascotService.updateProfile({
        personality: mascotPersonality as 'friendly' | 'professional' | 'playful' | 'minimal',
        proactivity: mascotProactivity
      })
      setMessage({ type: 'success', text: 'Assistant settings saved successfully!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save assistant settings' })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setLoading(false)
    }
  }

  const testVoiceSettings = async () => {
    try {
      setLoading(true)
      await voiceService.validateConfig(voiceSettings)
      await voiceService.testTts('Testing voice configuration with current settings')
      setMessage({ type: 'success', text: 'Voice test completed successfully!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: 'Voice test failed' })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setLoading(false)
    }
  }

  const enablePushNotifications = async () => {
    try {
      setLoading(true)
      const success = await notificationService.registerPushNotifications()
      if (success) {
        const updated = new NotificationPreferences(notificationSettings)
        updated.pushNotifications = true
        setNotificationSettings(updated)
        setMessage({ type: 'success', text: 'Push notifications enabled!' })
      } else {
        setMessage({ type: 'warning', text: 'Push notifications permission denied' })
      }
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to enable push notifications' })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setLoading(false)
    }
  }

  const updateNotificationSetting = (field: keyof NotificationPreferences, value: boolean) => {
    const updated = new NotificationPreferences(notificationSettings)
    ;(updated as any)[field] = value
    setNotificationSettings(updated)
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <UserIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Please sign in to view your profile</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'profile', name: 'Profile', icon: UserIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'voice', name: 'Voice', icon: SpeakerWaveIcon },
    { id: 'mascot', name: 'Assistant', icon: ChatBubbleLeftRightIcon }
  ]

  return (
    <div className="space-y-6">
      {/* Message Banner */}
      {message && (
        <div className={`rounded-lg p-4 flex items-center space-x-2 ${
          message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' :
          message.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200' :
          'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200'
        }`}>
          {message.type === 'success' && <CheckIcon className="w-5 h-5" />}
          {message.type === 'error' && <XMarkIcon className="w-5 h-5" />}
          {message.type === 'warning' && <ExclamationTriangleIcon className="w-5 h-5" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.name}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        {activeTab === 'profile' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Profile Information</h3>
            <div className="flex items-center space-x-4 mb-6">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                <UserIcon className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {getUserDisplayName(user)}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {(user as any).email || 'No email provided'}
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Member since</span>
                <span className="text-gray-900 dark:text-white">
                  {(user as any).createdAt ? new Date((user as any).createdAt).toLocaleDateString() : 'Recently'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Status</span>
                <span className="text-green-600 dark:text-green-400">Active</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Notification Preferences</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="email-notifications" className="text-sm font-medium text-gray-900 dark:text-white">Email Notifications</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Receive email updates and alerts</p>
                </div>
                <input
                  id="email-notifications"
                  type="checkbox"
                  checked={notificationSettings.emailNotifications || false}
                  onChange={(e) => updateNotificationSetting('emailNotifications', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="push-notifications" className="text-sm font-medium text-gray-900 dark:text-white">Push Notifications</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Receive browser push notifications</p>
                </div>
                <div className="flex items-center space-x-2">
                  {!notificationSettings.pushNotifications && (
                    <button
                      onClick={enablePushNotifications}
                      disabled={loading}
                      className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Enable
                    </button>
                  )}
                  <input
                    id="push-notifications"
                    type="checkbox"
                    checked={notificationSettings.pushNotifications || false}
                    readOnly
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="weekly-digest" className="text-sm font-medium text-gray-900 dark:text-white">Weekly Digest</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Receive weekly activity summaries</p>
                </div>
                <input
                  id="weekly-digest"
                  type="checkbox"
                  checked={notificationSettings.weeklyDigest || false}
                  onChange={(e) => updateNotificationSetting('weeklyDigest', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
            </div>
            
            <button
              onClick={saveNotificationSettings}
              disabled={loading}
              className="mt-6 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Notification Settings'}
            </button>
          </div>
        )}

        {activeTab === 'voice' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Voice Configuration</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="voice-language" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                  Voice Language
                </label>
                <select
                  id="voice-language"
                  value={voiceSettings.voiceLanguage}
                  onChange={(e) => setVoiceSettings(prev => ({ ...prev, voiceLanguage: e.target.value }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {voiceService.getSupportedLanguages().map(lang => (
                    <option key={lang} value={lang}>
                      {voiceService.getLanguageDisplayName(lang)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="voice-speed" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                  Voice Speed: {voiceSettings.voiceSpeed}x ({voiceService.getSpeedDescription(voiceSettings.voiceSpeed)})
                </label>
                <input
                  id="voice-speed"
                  type="range"
                  min="0.25"
                  max="4.0"
                  step="0.25"
                  value={voiceSettings.voiceSpeed}
                  onChange={(e) => setVoiceSettings(prev => ({ ...prev, voiceSpeed: parseFloat(e.target.value) }))}
                  className="w-full"
                />
              </div>
              
              <div>
                <label htmlFor="voice-volume" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                  Voice Volume: {Math.round(voiceSettings.voiceVolume * 100)}%
                </label>
                <input
                  id="voice-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={voiceSettings.voiceVolume}
                  onChange={(e) => setVoiceSettings(prev => ({ ...prev, voiceVolume: parseFloat(e.target.value) }))}
                  className="w-full"
                />
              </div>
              
              <div>
                <label htmlFor="mic-sensitivity" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                  Microphone Sensitivity: {Math.round(voiceSettings.microphoneSensitivity * 100)}% ({voiceService.getSensitivityDescription(voiceSettings.microphoneSensitivity)})
                </label>
                <input
                  id="mic-sensitivity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={voiceSettings.microphoneSensitivity}
                  onChange={(e) => setVoiceSettings(prev => ({ ...prev, microphoneSensitivity: parseFloat(e.target.value) }))}
                  className="w-full"
                />
              </div>
              
              <div>
                <label htmlFor="wake-word" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                  Wake Word
                </label>
                <input
                  id="wake-word"
                  type="text"
                  value={voiceSettings.wakeWord}
                  onChange={(e) => setVoiceSettings(prev => ({ ...prev, wakeWord: e.target.value }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter wake word"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Recommended: {voiceService.getRecommendedWakeWords().slice(0, 3).join(', ')}
                </p>
              </div>
              
              <div className="flex items-center">
                <input
                  id="continuous-listening"
                  type="checkbox"
                  checked={voiceSettings.continuousListening}
                  onChange={(e) => setVoiceSettings(prev => ({ ...prev, continuousListening: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2"
                />
                <label htmlFor="continuous-listening" className="text-sm font-medium text-gray-900 dark:text-white">
                  Continuous Listening
                </label>
              </div>
            </div>
            
            <button
              onClick={testVoiceSettings}
              disabled={loading}
              className="mt-6 mr-3 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Testing...' : 'Test Voice'}
            </button>
          </div>
        )}

        {activeTab === 'mascot' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Assistant Personality</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="personality-type" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                  Personality Type
                </label>
                <select
                  id="personality-type"
                  value={mascotPersonality}
                  onChange={(e) => setMascotPersonality(e.target.value)}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="friendly">Friendly - Warm and approachable</option>
                  <option value="professional">Professional - Formal and business-focused</option>
                  <option value="playful">Playful - Fun and creative</option>
                  <option value="minimal">Minimal - Concise and to-the-point</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {mascotService.getPersonalityDescription(mascotPersonality)}
                </p>
              </div>
              
              <div>
                <label htmlFor="proactivity" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                  Proactivity: {mascotProactivity}/10
                </label>
                <input
                  id="proactivity"
                  type="range"
                  min="1"
                  max="10"
                  value={mascotProactivity}
                  onChange={(e) => setMascotProactivity(parseInt(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">How often the assistant offers suggestions</p>
              </div>
            </div>
            
            <button
              onClick={saveMascotSettings}
              disabled={loading}
              className="mt-6 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Assistant Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}