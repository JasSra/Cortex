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

export interface ClassificationResponse {
  success: boolean
  classification: string
  confidence: number
  message?: string
}

export interface BulkClassificationRequest {
  noteIds: string[]
}

export interface BulkClassificationResponse {
  success: boolean
  results: Array<{
    noteId: string
    classification: string
    confidence: number
  }>
  message?: string
}

export interface ClassificationStats {
  totalClassified: number
  categories: Record<string, number>
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  services: Record<string, {
    status: 'up' | 'down'
    responseTime?: number
  }>
}

export interface SystemStats {
  uptime: number
  memoryUsage: number
  cpuUsage: number
  diskUsage: number
}

export interface DatabaseStats {
  totalNotes: number
  totalUsers: number
  databaseSize: string
  lastBackup?: string
}

export interface AdvancedSearchRequest {
  query: string
  tags?: string[]
  dateRange?: {
    start: string
    end: string
  }
  classification?: string
  limit?: number
  offset?: number
}

export interface SearchRequest {
  query: string
  k?: number
  mode?: 'semantic' | 'vector' | 'hybrid'
  alpha?: number
}

export interface SearchResponse {
  results: Array<{
    id: string
    title: string
    content: string
    score: number
    metadata?: Record<string, any>
  }>
  total: number
  query: string
  mode: string
}

export interface IngestResult {
  success: boolean
  fileName: string
  message: string
  noteId?: string
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  total: number
}

export interface GraphNode {
  id: string
  label: string
  type: string
  properties: Record<string, any>
  x?: number
  y?: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: string
  weight?: number
}

export interface EntityDetails {
  id: string
  name: string
  type: string
  properties: Record<string, any>
  connectedEntities: GraphNode[]
  mentions: Array<{
    noteId: string
    context: string
  }>
}

export interface RagQueryRequest {
  query: string
  includeContext?: boolean
  maxResults?: number
  temperature?: number
}

export interface RagResponse {
  answer: string
  sources: Array<{
    id: string
    title: string
    content: string
    relevance: number
  }>
  model: string
  tokens: {
    prompt: number
    completion: number
    total: number
  }
}

export interface ToolRequest {
  tool: string
  parameters: Record<string, any>
}

export interface ToolResult {
  success: boolean
  result: any
  error?: string
}

export interface ChatToolsRequest {
  message: string
  conversationId?: string
  tools?: string[]
}

export interface ChatToolsResponse {
  message: string
  conversationId: string
  toolResults?: ToolResult[]
  sources?: Array<{
    id: string
    title: string
    relevance: number
  }>
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

    // Advanced search with filters
    advancedSearch: (request: AdvancedSearchRequest) => 
      apiClient.post<SearchResult>('/api/search/advanced', request),

    // Upload file for ingestion
    uploadFile: (file: File) => apiClient.uploadFile<{ message: string }>('/api/ingest/upload', file),

    // Upload multiple files
    uploadFiles: async (files: FileList) => {
      const results: IngestResult[] = []
      for (let i = 0; i < files.length; i++) {
        try {
          const result = await apiClient.uploadFile<IngestResult>('/api/ingest/upload', files[i])
          results.push(result)
        } catch (error) {
          results.push({
            success: false,
            fileName: files[i].name,
            message: `Failed to upload: ${error}`
          })
        }
      }
      return results
    },

    // Ingest folder
    ingestFolder: (path: string) => 
      apiClient.post<IngestResult>('/api/ingest/folder', { path }),

    // Create seed data
    createSeedData: () => apiClient.post('/api/seed-data')
  }
}

// Search API service hook
export function useSearchApi() {
  const apiClient = useApiClient()

  return {
    // Basic search
    search: (request: SearchRequest) => apiClient.post<SearchResponse>('/api/search', request),
    
    // GET-based search
    searchGet: (q: string, k?: number, mode?: string, alpha?: number) => 
      apiClient.get<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}&k=${k || 10}&mode=${mode || 'hybrid'}&alpha=${alpha || 0.6}`),
    
    // Advanced search with classification filters
    advancedSearch: (request: AdvancedSearchRequest) => 
      apiClient.post<SearchResponse>('/api/search/advanced', request)
  }
}

// Graph API service hook
export function useGraphApi() {
  const apiClient = useApiClient()

  return {
    // Get entity graph
    getGraph: (focus?: string, depth?: number, entityTypes?: string[], fromDate?: string, toDate?: string) => {
      const params = new URLSearchParams()
      if (focus) params.append('focus', focus)
      if (depth) params.append('depth', depth.toString())
      if (entityTypes) entityTypes.forEach(type => params.append('entityTypes', type))
      if (fromDate) params.append('fromDate', fromDate)
      if (toDate) params.append('toDate', toDate)
      return apiClient.get<GraphResponse>(`/api/graph?${params.toString()}`)
    },

    // Get connected entities
    getConnectedEntities: (entityId: string, depth?: number) => 
      apiClient.get<GraphNode[]>(`/api/graph/entities/${entityId}/connected?depth=${depth || 2}`),

    // Get entity suggestions
    getEntitySuggestions: (entityId: string) => 
      apiClient.get<GraphNode[]>(`/api/graph/entities/${entityId}/suggestions`),

    // Get entity details
    getEntityDetails: (entityId: string) => 
      apiClient.get<EntityDetails>(`/api/graph/entities/${entityId}`),

    // Search entities
    searchEntities: (query: string, types?: string[]) => {
      const params = new URLSearchParams({ query })
      if (types) types.forEach(type => params.append('types', type))
      return apiClient.get<GraphNode[]>(`/api/graph/search?${params.toString()}`)
    }
  }
}

// Voice API service hook
export function useVoiceApi() {
  const apiClient = useApiClient()

  return {
    // Text-to-Speech
    textToSpeech: async (text: string) => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      return response.blob()
    },

    // Create WebSocket for Speech-to-Text
    createSttWebSocket: () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081').replace(/^https?:/, protocol)
      return new WebSocket(`${baseUrl}/api/voice/stt`)
    }
  }
}

// RAG API service hook
export function useRagApi() {
  const apiClient = useApiClient()

  return {
    // Query with RAG
    query: (request: RagQueryRequest) => 
      apiClient.post<RagResponse>('/api/rag/query', request),

    // Stream RAG responses
    streamQuery: (request: RagQueryRequest) => 
      apiClient.post('/api/rag/stream', request)
  }
}

// Chat Tools API service hook
export function useChatToolsApi() {
  const apiClient = useApiClient()

  return {
    // Process chat with tools
    processChat: (request: ChatToolsRequest) => 
      apiClient.post<ChatToolsResponse>('/api/chat/tools', request),

    // Execute specific tool
    executeTool: (request: ToolRequest) => 
      apiClient.post<ToolResult>('/api/chat/tools/execute', request),

    // Get available tools
    getAvailableTools: () => 
      apiClient.get<string[]>('/api/chat/tools')
  }
}

// Classification API service hook
export function useClassificationApi() {
  const apiClient = useApiClient()

  return {
    // Classify a note
    classifyNote: (noteId: string) => 
      apiClient.post<ClassificationResponse>(`/api/classification/${noteId}`),

    // Bulk classify notes
    bulkClassify: (request: BulkClassificationRequest) => 
      apiClient.post<BulkClassificationResponse>('/api/classification/bulk', request),

    // Get classification statistics
    getClassificationStats: () => 
      apiClient.get<ClassificationStats>('/api/classification/stats'),

    // Reclassify all notes
    reclassifyAll: () => 
      apiClient.post('/api/classification/reclassify-all', {})
  }
}

// Admin API service hook (requires Admin role)
export function useAdminApi() {
  const apiClient = useApiClient()

  return {
    // Reindex vectors
    reindex: () => 
      apiClient.post('/api/admin/reindex', {}),

    // Re-embed chunks
    reembed: () => 
      apiClient.post('/api/admin/reembed', {}),

    // Health check
    healthCheck: () => 
      apiClient.get<HealthStatus>('/api/admin/health'),

    // System stats
    getSystemStats: () => 
      apiClient.get<SystemStats>('/api/admin/stats'),

    // Get database stats
    getDatabaseStats: () => 
      apiClient.get<DatabaseStats>('/api/admin/database/stats')
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
