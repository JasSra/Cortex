// Typed models for VoiceController interactions

export interface VoiceConfigRequest {
  voiceLanguage?: string
  voiceSpeed?: number
  voiceVolume?: number
  microphoneSensitivity?: number
  continuousListening?: boolean
  wakeWord?: string
}

export interface VoiceConfigValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  validatedConfig?: VoiceConfigRequest
}
