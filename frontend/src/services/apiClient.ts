'use client'

import { useAuth } from '../contexts/AuthContext'

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
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
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
  const { getAccessToken } = useAuth()
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
