// Service for mascot profile management
import { 
  CortexApiClient, 
  UpdateMascotProfileRequest, 
  MascotProfileDto 
} from '../api/cortex-api-client'

export class MascotService {
  constructor(private client: CortexApiClient) {}

  async getProfile(): Promise<MascotProfileDto> {
    return await this.client.mascotProfileGET()
  }

  async updateProfile(request: {
    enabled?: boolean
    personality?: 'friendly' | 'professional' | 'playful' | 'minimal'
    animations?: boolean
    voice?: boolean
    proactivity?: number
  }): Promise<MascotProfileDto> {
    const updateRequest = new UpdateMascotProfileRequest(request)
    return await this.client.mascotProfilePUT(updateRequest)
  }

  // Helper methods for personality-based responses
  getPersonalityDescription(personality: string): string {
    switch (personality) {
      case 'friendly':
        return 'Warm, encouraging, and supportive. Uses casual language and positive reinforcement.'
      case 'professional':
        return 'Clear, concise, and task-focused. Maintains professional tone and efficiency.'
      case 'playful':
        return 'Fun, enthusiastic, and creative. Uses humor and engaging interactions.'
      case 'minimal':
        return 'Brief, direct, and unobtrusive. Provides essential information only.'
      default:
        return 'Balanced and adaptable to your needs.'
    }
  }

  getPersonalityQuirks(personality: string): string[] {
    switch (personality) {
      case 'friendly':
        return [
          'Uses emojis and warm greetings',
          'Celebrates your achievements enthusiastically',
          'Offers encouragement during difficult tasks',
          'Remembers your preferences and mentions them'
        ]
      case 'professional':
        return [
          'Provides structured, organized responses',
          'Focuses on efficiency and productivity',
          'Uses clear, formal language',
          'Offers actionable insights and recommendations'
        ]
      case 'playful':
        return [
          'Uses creative analogies and metaphors',
          'Incorporates light humor and wordplay',
          'Suggests fun ways to approach tasks',
          'Celebrates with animated reactions'
        ]
      case 'minimal':
        return [
          'Keeps interactions brief and to the point',
          'Only appears when necessary',
          'Provides essential information without elaboration',
          'Respects your focus and workflow'
        ]
      default:
        return []
    }
  }

  // Proactivity level descriptions
  getProactivityDescription(level: number): string {
    if (level < 0.2) return 'Very quiet - only essential notifications'
    if (level < 0.4) return 'Low - occasional helpful suggestions'
    if (level < 0.6) return 'Moderate - balanced assistance and tips'
    if (level < 0.8) return 'Active - frequent suggestions and engagement'
    return 'Very active - constant guidance and interaction'
  }
}
