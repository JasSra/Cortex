// Service for voice configuration and validation
import { 
  CortexApiClient, 
  VoiceConfigRequest,
  VoiceTtsRequest,
  VoiceTestRequest
} from '../api/cortex-api-client'

// Custom interface since the generated client doesn't include the validation result
export interface VoiceConfigValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  validatedConfig?: any
}

export class VoiceService {
  constructor(private client: CortexApiClient) {}

  async validateConfig(config: {
    voiceLanguage?: string
    voiceSpeed?: number
    voiceVolume?: number
    microphoneSensitivity?: number
    continuousListening?: boolean
    wakeWord?: string
  }): Promise<void> {
    const request = new VoiceConfigRequest(config)
    return await this.client.config(request)
  }

  async generateTts(text: string): Promise<void> {
    const request = new VoiceTtsRequest({ text })
    return await this.client.tts(request)
  }

  async testTts(text?: string): Promise<void> {
    const request = new VoiceTestRequest({ text })
    return await this.client.test2(request)
  }

  // Helper methods for voice configuration
  getSupportedLanguages(): string[] {
    return [
      'en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 
      'it-IT', 'pt-BR', 'ru-RU', 'ja-JP', 'ko-KR',
      'zh-CN', 'ar-SA', 'hi-IN', 'nl-NL', 'sv-SE'
    ]
  }

  getLanguageDisplayName(code: string): string {
    const names: Record<string, string> = {
      'en-US': 'English (US)',
      'en-GB': 'English (UK)',
      'es-ES': 'Spanish (Spain)',
      'fr-FR': 'French (France)',
      'de-DE': 'German (Germany)',
      'it-IT': 'Italian (Italy)',
      'pt-BR': 'Portuguese (Brazil)',
      'ru-RU': 'Russian (Russia)',
      'ja-JP': 'Japanese (Japan)',
      'ko-KR': 'Korean (Korea)',
      'zh-CN': 'Chinese (Simplified)',
      'ar-SA': 'Arabic (Saudi Arabia)',
      'hi-IN': 'Hindi (India)',
      'nl-NL': 'Dutch (Netherlands)',
      'sv-SE': 'Swedish (Sweden)'
    }
    return names[code] || code
  }

  getSpeedDescription(speed: number): string {
    if (speed < 0.5) return 'Very slow'
    if (speed < 0.75) return 'Slow'
    if (speed < 1.25) return 'Normal'
    if (speed < 1.75) return 'Fast'
    return 'Very fast'
  }

  getSensitivityDescription(sensitivity: number): string {
    if (sensitivity < 0.2) return 'Very low (quiet environments)'
    if (sensitivity < 0.4) return 'Low (office environments)'
    if (sensitivity < 0.6) return 'Medium (normal environments)'
    if (sensitivity < 0.8) return 'High (noisy environments)'
    return 'Very high (very noisy environments)'
  }

  getRecommendedWakeWords(): string[] {
    return [
      'cortex', 'assistant', 'computer', 'hello cortex',
      'hey assistant', 'jarvis', 'friday', 'alexa'
    ]
  }

  // Validation helpers
  validateSpeed(speed: number): { valid: boolean; message?: string } {
    if (speed < 0.25 || speed > 4.0) {
      return { valid: false, message: 'Speed must be between 0.25x and 4.0x' }
    }
    if (speed < 0.5 || speed > 2.0) {
      return { valid: true, message: 'Speed outside recommended range (0.5x - 2.0x) may affect quality' }
    }
    return { valid: true }
  }

  validateVolume(volume: number): { valid: boolean; message?: string } {
    if (volume < 0 || volume > 1) {
      return { valid: false, message: 'Volume must be between 0% and 100%' }
    }
    return { valid: true }
  }

  validateSensitivity(sensitivity: number): { valid: boolean; message?: string } {
    if (sensitivity < 0 || sensitivity > 1) {
      return { valid: false, message: 'Sensitivity must be between 0% and 100%' }
    }
    return { valid: true }
  }

  validateWakeWord(wakeWord: string): { valid: boolean; message?: string } {
    if (wakeWord.length < 3) {
      return { valid: false, message: 'Wake word must be at least 3 characters' }
    }
    if (wakeWord.length > 50) {
      return { valid: false, message: 'Wake word must not exceed 50 characters' }
    }
    const recommended = this.getRecommendedWakeWords()
    if (!recommended.includes(wakeWord.toLowerCase())) {
      return { valid: true, message: `Consider using a recommended wake word: ${recommended.slice(0, 3).join(', ')}` }
    }
    return { valid: true }
  }
}
