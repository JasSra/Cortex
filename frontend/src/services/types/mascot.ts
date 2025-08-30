// Typed models mapping to UserController mascot-profile endpoints

export interface MascotInteraction {
  id: string
  type: string
  message: string
  userResponse: string
  timestamp: string
  context: Record<string, any>
}

export interface MascotProfileDto {
  enabled: boolean
  personality: 'friendly' | 'professional' | 'playful' | 'minimal'
  animations: boolean
  voice: boolean
  proactivity: number
  interactionHistory: MascotInteraction[]
  personalityQuirks: string[]
  customResponses: string[]
}

export interface UpdateMascotProfileRequest {
  enabled?: boolean
  personality?: 'friendly' | 'professional' | 'playful' | 'minimal'
  animations?: boolean
  voice?: boolean
  proactivity?: number
}
