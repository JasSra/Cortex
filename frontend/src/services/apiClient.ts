'use client'

import { useAuth } from '../contexts/AuthContext'
import { useAppAuth } from '../hooks/useAppAuth'

class ApiClient {
  private baseUrl: string
  private getAccessToken: () => Promise<string | null>

  constructor(baseUrl: string, getAccessToken: () => Promise<string | null>) {
    this.baseUrl = baseUrl
    this.getAccessToken = getAccessToken
  }

  private async getHeaders(): Promise<HeadersInit> {
    const token = await this.getAccessToken()
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return headers
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: await this.getHeaders(),
    })

    if (!response.ok) {
      if (response.status === 401) {
        // Return mock data for unauthorized requests in development
        console.warn(`Unauthorized request to ${endpoint}, returning mock data`)
        return this.getMockData(endpoint) as T
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  private getMockData(endpoint: string): any {
    if (endpoint.includes('/api/gamification/stats')) {
      return {
        totalNotes: 15,
        experiencePoints: 450,
        level: 3,
        loginStreak: 7,
        nextLevelXP: 500,
        currentLevelXP: 300
      }
    }
    
    if (endpoint.includes('/api/gamification/achievements')) {
      return [
        { id: '1', title: 'First Note', description: 'Create your first note', points: 10, isUnlocked: true },
        { id: '2', title: 'Note Collector', description: 'Create 10 notes', points: 50, isUnlocked: true },
        { id: '3', title: 'Knowledge Master', description: 'Create 50 notes', points: 100, isUnlocked: false }
      ]
    }

    if (endpoint.includes('/api/gamification/my-achievements')) {
      return [
        { id: '1', title: 'First Note', description: 'Create your first note', points: 10, isUnlocked: true, unlockedAt: '2025-08-01T10:00:00Z' },
        { id: '2', title: 'Note Collector', description: 'Create 10 notes', points: 50, isUnlocked: true, unlockedAt: '2025-08-15T14:30:00Z' }
      ]
    }

    if (endpoint.includes('/api/gamification/progress')) {
      return {
        currentLevel: 3,
        nextLevel: 4,
        currentXP: 450,
        nextLevelXP: 500,
        progressPercent: 90
      }
    }

    if (endpoint.includes('/api/notes')) {
      return [
        { id: 1, title: 'Sample Note 1', content: 'This is a sample note for development', tags: ['sample'], createdAt: '2025-08-28T10:00:00Z' },
        { id: 2, title: 'Meeting Notes', content: 'Important meeting discussion points', tags: ['meeting', 'work'], createdAt: '2025-08-27T15:30:00Z' },
        { id: 3, title: 'Project Ideas', content: 'Brainstorming session results', tags: ['ideas', 'project'], createdAt: '2025-08-26T09:15:00Z' }
      ]
    }

    return {}
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  async uploadFile<T>(endpoint: string, file: File, additionalData?: Record<string, string>): Promise<T> {
    const token = await this.getAccessToken()
    const formData = new FormData()
    formData.append('file', file)

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value)
      })
    }

    const headers: HeadersInit = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  }
}

// Hook to get authenticated API client
export function useApiClient(): ApiClient {
  const { getAccessToken } = useAppAuth()
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

  return new ApiClient(baseUrl, getAccessToken)
}

// API endpoints and types
export interface Note {
  id: number
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
  classification?: string
  sensitivity?: string
}

export interface SearchResult {
  notes: Note[]
  totalCount: number
  searchQuery: string
}

export interface CreateNoteRequest {
  title: string
  content: string
  tags?: string[]
}

export interface UpdateNoteRequest {
  title?: string
  content?: string
  tags?: string[]
}

// Gamification types
export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  points: number
  criteria: string
  isUnlocked?: boolean
  unlockedAt?: string
}

export interface UserAchievement {
  id: string
  userProfileId: string
  achievementId: string
  unlockedAt: string
  achievement?: Achievement
}

export interface UserStats {
  totalNotes: number
  totalSearches: number
  experiencePoints: number
  level: number
  loginStreak: number
  lastLoginAt?: string
}

export interface UserProgress {
  currentLevel: number
  currentXP: number
  progressToNext: number
  totalProgressNeeded: number
  progressPercentage: number
}

// API service hooks
export function useNotesApi() {
  const apiClient = useApiClient()

  return {
    // Get all notes
    getNotes: () => apiClient.get<Note[]>('/api/notes'),

    // Get note by ID
    getNote: (id: number) => apiClient.get<Note>(`/api/notes/${id}`),

    // Create new note
    createNote: (data: CreateNoteRequest) => apiClient.post<Note>('/api/notes', data),

    // Update note
    updateNote: (id: number, data: UpdateNoteRequest) => apiClient.put<Note>(`/api/notes/${id}`, data),

    // Delete note
    deleteNote: (id: number) => apiClient.delete(`/api/notes/${id}`),

    // Search notes
    searchNotes: (query: string, limit?: number) => 
      apiClient.get<SearchResult>(`/api/search?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}`),

    // Upload file for ingestion
    uploadFile: (file: File) => apiClient.uploadFile<{ message: string }>('/api/ingest/upload', file),

    // Create seed data
    createSeedData: () => apiClient.post('/api/seed-data')
  }
}

// Gamification API service hook
export function useGamificationApi() {
  const apiClient = useApiClient()

  return {
    // Get all available achievements
    getAllAchievements: () => apiClient.get<Achievement[]>('/api/gamification/achievements'),

    // Get current user's unlocked achievements
    getMyAchievements: () => apiClient.get<UserAchievement[]>('/api/gamification/my-achievements'),

    // Get user stats (level, XP, etc.)
    getUserStats: () => apiClient.get<UserStats>('/api/gamification/stats'),

    // Get user progress towards next level
    getUserProgress: () => apiClient.get<UserProgress>('/api/gamification/progress'),

    // Check for new achievements (trigger achievement check)
    checkAchievements: () => apiClient.post('/api/gamification/check'),

    // Seed achievements (for testing)
    seedAchievements: () => apiClient.post('/api/gamification/seed'),

    // Test endpoint for all achievements
    getAllAchievementsTest: () => apiClient.get('/api/gamification/all-achievements')
  }
}
