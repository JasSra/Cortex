'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useConfigurationApi } from '@/services/apiClient'
import {
  ConfigurationSection,
  ConfigurationSetting,
  ConfigurationFormData,
  ConfigurationErrors,
  ConfigurationValidationResult,
  EMBEDDING_PROVIDERS,
  VOICE_PROVIDERS,
  OPENAI_MODELS,
  TTS_MODELS,
  TTS_VOICES,
  ProviderOption
} from '@/services/types/configuration'
import {
  CogIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'

export default function ConfigurationPage() {
  const { isAuthenticated, user } = useAuth()
  const { isCybertron } = useTheme()
  const configApi = useConfigurationApi()
  
  const [sections, setSections] = useState<ConfigurationSection[]>([])
  const [formData, setFormData] = useState<ConfigurationFormData>({})
  const [errors, setErrors] = useState<ConfigurationErrors>({})
  const [warnings, setWarnings] = useState<ConfigurationErrors>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [testing, setTesting] = useState(false)
  const [activeSection, setActiveSection] = useState<string>('OpenAI')
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, any>>({})

  // Load configuration on mount
  const loadConfiguration = useCallback(async () => {
    try {
      setLoading(true)
      const response = await configApi.getAllConfiguration()
      setSections(response)
      
      // Initialize form data
      const initialData: ConfigurationFormData = {}
      response.forEach(section => {
        section.settings.forEach(setting => {
          initialData[setting.key] = setting.value
        })
      })
      setFormData(initialData)
      
      // Set first section as active if none selected
      if (response.length > 0 && !activeSection) {
        setActiveSection(response[0].name)
      }
    } catch (error) {
      console.error('Failed to load configuration:', error)
      setErrors({ general: 'Failed to load configuration' })
    } finally {
      setLoading(false)
    }
  }, [configApi, activeSection])

  useEffect(() => {
    if (isAuthenticated) {
      loadConfiguration()
    }
  }, [isAuthenticated, loadConfiguration])

  const handleFieldChange = useCallback((key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    
    // Clear error for this field
    if (errors[key]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[key]
        return newErrors
      })
    }
  }, [errors])

  const validateConfiguration = useCallback(async (showResults = false) => {
    try {
      setValidating(true)
      
      const updates = Object.entries(formData).map(([key, value]) => ({
        key,
        value: value || ''
      }))
      
      const validation = await configApi.validateConfiguration(updates)
      
      // Update errors and warnings
      const newErrors: ConfigurationErrors = {}
      const newWarnings: ConfigurationErrors = {}
      
      validation.errors.forEach(error => {
        newErrors[error.key] = error.message
      })
      
      validation.warnings.forEach(warning => {
        newWarnings[warning.key] = warning.message
      })
      
      setErrors(newErrors)
      setWarnings(newWarnings)
      
      if (showResults) {
        // Show validation results in UI
        console.log('Validation results:', validation)
      }
      
      return validation
    } catch (error) {
      console.error('Validation failed:', error)
      setErrors({ general: 'Validation failed' })
      return { isValid: false, errors: [], warnings: [], message: 'Validation failed' }
    } finally {
      setValidating(false)
    }
  }, [formData, configApi])

  const saveConfiguration = useCallback(async () => {
    try {
      setSaving(true)
      
      // Validate first
      const validation = await validateConfiguration()
      if (!validation.isValid) {
        return
      }
      
      const updates = Object.entries(formData).map(([key, value]) => ({
        key,
        value: value || ''
      }))
      
      await configApi.updateConfiguration(updates)
      
      // Reload configuration to get updated values
      await loadConfiguration()
      
      // Clear test results as configuration changed
      setTestResults({})
      
      console.log('Configuration saved successfully')
    } catch (error) {
      console.error('Failed to save configuration:', error)
      setErrors({ general: 'Failed to save configuration' })
    } finally {
      setSaving(false)
    }
  }, [formData, configApi, validateConfiguration, loadConfiguration])

  const testConnections = useCallback(async () => {
    try {
      setTesting(true)
      
      // Build test requests based on current configuration
      const tests = []
      
      // Test OpenAI if API key is provided
      const openAiKey = formData['OpenAI:ApiKey']
      if (openAiKey) {
        tests.push({
          provider: 'openai',
          settings: { ApiKey: openAiKey }
        })
      }
      
      // Test Redis connection
      const redisConnection = formData['Redis:Connection']
      if (redisConnection) {
        tests.push({
          provider: 'redis',
          settings: { Connection: redisConnection }
        })
      }
      
      // Test embedding provider
      const embeddingProvider = formData['Embedding:Provider']
      if (embeddingProvider) {
        tests.push({
          provider: 'embedding',
          settings: {
            Provider: embeddingProvider,
            Model: formData['Embedding:Model'] || '',
            Dim: formData['Embedding:Dim'] || '1536'
          }
        })
      }
      
      if (tests.length === 0) {
        setTestResults({ message: 'No connections to test' })
        return
      }
      
      const results = await configApi.testConfiguration(tests)
      setTestResults(results)
      
    } catch (error) {
      console.error('Connection test failed:', error)
      setTestResults({ error: 'Connection test failed' })
    } finally {
      setTesting(false)
    }
  }, [formData, configApi])

  const toggleSensitiveVisibility = useCallback((key: string) => {
    setShowSensitive(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }, [])

  const getFieldOptions = useCallback((setting: ConfigurationSetting): ProviderOption[] => {
    try {
      const rules = JSON.parse(setting.validationRules)
      if (rules.options) {
        return rules.options.map((option: string) => ({
          value: option,
          label: option
        }))
      }
    } catch {
      // Fallback to predefined options
    }
    
    // Return predefined options based on setting key
    switch (setting.key) {
      case 'Embedding:Provider':
        return EMBEDDING_PROVIDERS
      case 'Voice:TtsProvider':
      case 'Voice:SttProvider':
        return VOICE_PROVIDERS
      case 'OpenAI:Model':
      case 'OpenAI:NerModel':
        return OPENAI_MODELS
      case 'OpenAI:TtsModel':
        return TTS_MODELS
      case 'OpenAI:TtsVoice':
        return TTS_VOICES
      default:
        return []
    }
  }, [])

  const renderField = useCallback((setting: ConfigurationSetting) => {
    const value = formData[setting.key] || ''
    const error = errors[setting.key]
    const warning = warnings[setting.key]
    const isVisible = showSensitive[setting.key]
    const options = getFieldOptions(setting)
    
    if (options.length > 0) {
      // Dropdown field
      return (
        <div key={setting.key} className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            {setting.description}
            {setting.requiresRestart && (
              <span className="ml-1 text-xs text-orange-500">(requires restart)</span>
            )}
          </label>
          <select
            value={value}
            onChange={(e) => handleFieldChange(setting.key, e.target.value)}
            title={setting.description}
            aria-label={setting.description}
            className={`block w-full rounded-xl border ${
              error ? 'border-red-300' : 'border-gray-300 dark:border-slate-600'
            } bg-white dark:bg-slate-800 px-3 py-2 text-sm placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500`}
          >
            <option value="">Select {setting.description}</option>
            {options.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {warning && <p className="text-sm text-orange-600">{warning}</p>}
        </div>
      )
    }
    
    // Text field
    return (
      <div key={setting.key} className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
          {setting.description}
          {setting.requiresRestart && (
            <span className="ml-1 text-xs text-orange-500">(requires restart)</span>
          )}
        </label>
        <div className="relative">
          <input
            type={setting.isSensitive && !isVisible ? 'password' : setting.valueType === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => handleFieldChange(setting.key, e.target.value)}
            placeholder={setting.defaultValue || 'Enter value...'}
            className={`block w-full rounded-xl border ${
              error ? 'border-red-300' : 'border-gray-300 dark:border-slate-600'
            } bg-white dark:bg-slate-800 px-3 py-2 text-sm placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 ${
              setting.isSensitive ? 'pr-10' : ''
            }`}
          />
          {setting.isSensitive && (
            <button
              type="button"
              onClick={() => toggleSensitiveVisibility(setting.key)}
              className="absolute inset-y-0 right-0 flex items-center pr-3"
            >
              {isVisible ? (
                <EyeSlashIcon className="h-4 w-4 text-gray-400" />
              ) : (
                <EyeIcon className="h-4 w-4 text-gray-400" />
              )}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {warning && <p className="text-sm text-orange-600">{warning}</p>}
      </div>
    )
  }, [formData, errors, warnings, showSensitive, handleFieldChange, toggleSensitiveVisibility, getFieldOptions])

  const activeConfigSection = useMemo(() => {
    return sections.find(section => section.name === activeSection)
  }, [sections, activeSection])

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Please sign in to access configuration
          </h2>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-purple-600" />
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">Loading configuration...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${
      isCybertron 
        ? 'bg-black' 
        : 'bg-gray-50 dark:bg-slate-900'
    }`}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center space-x-3">
            <CogIcon className="h-8 w-8 text-purple-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Configuration
              </h1>
              <p className="text-gray-600 dark:text-slate-400">
                Manage system settings and provider configurations
              </p>
            </div>
          </div>
        </div>

        {errors.general && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800"
          >
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
              <p className="ml-2 text-sm text-red-800 dark:text-red-200">{errors.general}</p>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar - Configuration Sections */}
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Sections
            </h2>
            {sections.map(section => (
              <button
                key={section.name}
                onClick={() => setActiveSection(section.name)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${
                  activeSection === section.name
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-700'
                    : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <div className="font-medium">{section.displayName}</div>
                <div className="text-sm opacity-75">{section.description}</div>
              </button>
            ))}
          </div>

          {/* Main Content - Active Section */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {activeConfigSection && (
                <motion.div
                  key={activeSection}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700"
                >
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {activeConfigSection.displayName}
                    </h2>
                    <p className="text-gray-600 dark:text-slate-400 mt-1">
                      {activeConfigSection.description}
                    </p>
                  </div>

                  <div className="space-y-6">
                    {activeConfigSection.settings
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map(renderField)}
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-8 flex flex-wrap items-center gap-4">
                    <button
                      onClick={saveConfiguration}
                      disabled={saving || Object.keys(errors).length > 0}
                      className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-medium transition-colors"
                    >
                      {saving ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircleIcon className="w-4 h-4" />
                      )}
                      {saving ? 'Saving...' : 'Save Configuration'}
                    </button>

                    <button
                      onClick={() => validateConfiguration(true)}
                      disabled={validating}
                      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-medium transition-colors"
                    >
                      {validating ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <InformationCircleIcon className="w-4 h-4" />
                      )}
                      {validating ? 'Validating...' : 'Validate Now'}
                    </button>

                    <button
                      onClick={testConnections}
                      disabled={testing}
                      className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-medium transition-colors"
                    >
                      {testing ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircleIcon className="w-4 h-4" />
                      )}
                      {testing ? 'Testing...' : 'Test Connections'}
                    </button>
                  </div>

                  {/* Test Results */}
                  {Object.keys(testResults).length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-4 rounded-xl bg-gray-50 dark:bg-slate-700"
                    >
                      <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                        Test Results
                      </h3>
                      {testResults.results ? (
                        <div className="space-y-2">
                          {testResults.results.map((result: any, index: number) => (
                            <div
                              key={index}
                              className={`flex items-center gap-2 text-sm ${
                                result.success ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {result.success ? (
                                <CheckCircleIcon className="w-4 h-4" />
                              ) : (
                                <ExclamationTriangleIcon className="w-4 h-4" />
                              )}
                              <span className="font-medium">{result.provider}:</span>
                              <span>{result.message}</span>
                              <span className="text-gray-500">({result.responseTime})</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {testResults.message || testResults.error || 'No test results'}
                        </p>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
