// Configuration API types

export interface ConfigurationSection {
  name: string
  displayName: string
  description: string
  settings: ConfigurationSetting[]
}

export interface ConfigurationSetting {
  id: string
  key: string
  value: string
  valueType: string
  section: string
  description: string
  isSensitive: boolean
  requiresRestart: boolean
  defaultValue: string
  validationRules: string
  sortOrder: number
  updatedAt: string
}

export interface ConfigurationUpdateItem {
  key: string
  value: string
}

export interface UpdateConfigurationRequest {
  settings: ConfigurationUpdateItem[]
}

export interface ConfigurationValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  message: string
}

export interface ValidationError {
  key: string
  message: string
  code: string
}

export interface ValidationWarning {
  key: string
  message: string
  code: string
}

export interface ProviderTest {
  provider: string
  settings: Record<string, string>
}

export interface ConfigurationTestResult {
  success: boolean
  message: string
  results: TestResult[]
}

export interface TestResult {
  provider: string
  success: boolean
  message: string
  responseTime: string
  details?: string
}

export interface SetConfigurationValueRequest {
  value: string
}

// UI-specific types
export interface ConfigurationFormData {
  [key: string]: string
}

export interface ConfigurationErrors {
  [key: string]: string
}

export interface ConfigurationFieldProps {
  setting: ConfigurationSetting
  value: string
  error?: string
  onChange: (value: string) => void
  disabled?: boolean
}

// Provider option types for dropdowns
export interface ProviderOption {
  value: string
  label: string
  description?: string
}

export const EMBEDDING_PROVIDERS: ProviderOption[] = [
  { value: 'openai', label: 'OpenAI', description: 'Use OpenAI embedding models' },
  { value: 'local', label: 'Local', description: 'Use local embedding models' },
  { value: 'azure', label: 'Azure OpenAI', description: 'Use Azure OpenAI Service' }
]

export const VOICE_PROVIDERS: ProviderOption[] = [
  { value: 'openai', label: 'OpenAI', description: 'Use OpenAI TTS/STT services' },
  { value: 'piper', label: 'Piper', description: 'Use local Piper TTS' },
  { value: 'local', label: 'Local', description: 'Use local voice services' }
]

export const OPENAI_MODELS: ProviderOption[] = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Fast and cost-effective' },
  { value: 'gpt-4o', label: 'GPT-4o', description: 'Most capable model' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: 'Fast and efficient' }
]

export const TTS_MODELS: ProviderOption[] = [
  { value: 'tts-1', label: 'TTS-1', description: 'Standard quality' },
  { value: 'tts-1-hd', label: 'TTS-1 HD', description: 'High quality' }
]

export const TTS_VOICES: ProviderOption[] = [
  { value: 'alloy', label: 'Alloy', description: 'Neutral voice' },
  { value: 'echo', label: 'Echo', description: 'Natural voice' },
  { value: 'fable', label: 'Fable', description: 'Expressive voice' },
  { value: 'onyx', label: 'Onyx', description: 'Deep voice' },
  { value: 'nova', label: 'Nova', description: 'Bright voice' },
  { value: 'shimmer', label: 'Shimmer', description: 'Warm voice' }
]
