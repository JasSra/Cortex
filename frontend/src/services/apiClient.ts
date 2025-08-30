"use client"

import { useAppAuth } from '@/hooks/useAppAuth'
import { CortexApiClient } from '@/api/cortex-api-client'

function createAuthedFetch(getAccessToken: () => Promise<string | null>) {
  return async (url: RequestInfo, init?: RequestInit) => {
    const token = await getAccessToken()
    const headers = new Headers(init?.headers || {})
    if (!headers.has('Content-Type') && (!init || init?.body)) headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(url, { ...(init || {}), headers })
  }
}

// Main hook: use the generated CortexApiClient everywhere
export function useCortexApiClient(): CortexApiClient {
  const { getAccessToken } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  return new CortexApiClient(baseUrl, { fetch: createAuthedFetch(getAccessToken) })
}

// For endpoints not fully typed in OpenAPI, use a minimal authed fetch wrapper
function useAuthedFetch() {
  const { getAccessToken } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  const authedFetch = createAuthedFetch(getAccessToken)
  return {
    get: async <T>(path: string): Promise<T> => {
      const res = await authedFetch(`${baseUrl}${path}`)
      if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
      return res.json() as Promise<T>
    },
    post: async <T>(path: string, body?: any): Promise<T> => {
      const res = await authedFetch(`${baseUrl}${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
      if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
      return res.json() as Promise<T>
    },
  }
}

// Gamification
export function useGamificationApi() {
  // Use authed fetch because the generated client lacks response schemas (typed as void)
  const http = useAuthedFetch()
  return {
    getAllAchievements: () => http.get<any[]>('/api/Gamification/achievements'),
    getMyAchievements: () => http.get<any[]>('/api/Gamification/my-achievements'),
    getUserStats: async () => {
      const s = await http.get<any>('/api/Gamification/stats')
      // Normalize field names to camelCase expected by UI
      return {
        totalNotes: s?.TotalNotes ?? s?.totalNotes ?? 0,
        totalSearches: s?.TotalSearches ?? s?.totalSearches ?? 0,
        totalXp: s?.ExperiencePoints ?? s?.experiencePoints ?? s?.totalXp ?? 0,
        level: s?.Level ?? s?.level ?? 1,
        loginStreak: s?.LoginStreak ?? s?.loginStreak ?? 0,
        lastLoginAt: s?.LastLoginAt ?? s?.lastLoginAt ?? null,
      }
    },
    getUserProgress: async () => {
      const p = await http.get<any>('/api/Gamification/progress')
      return {
        currentLevel: p?.currentLevel ?? p?.CurrentLevel ?? 1,
        currentXp: p?.currentXP ?? p?.currentXp ?? p?.CurrentXP ?? 0,
        progressToNext: p?.progressToNext ?? p?.ProgressToNext ?? 0,
        totalProgressNeeded: p?.totalProgressNeeded ?? p?.TotalProgressNeeded ?? 0,
        progressPercentage: p?.progressPercentage ?? p?.ProgressPercentage ?? 0,
      }
    },
    checkAchievements: () => http.post<any>('/api/Gamification/check-achievements'),
    seedAchievements: () => http.post<any>('/api/Gamification/seed'),
    getAllAchievementsTest: () => http.get<any>('/api/Gamification/all-achievements'),
  }
}

// Admin
export function useAdminApi() {
  const client = useCortexApiClient()
  return {
    reindex: () => client.reindex(),
    reembed: () => client.reembed(),
    healthCheck: () => client.health(),
    getSystemStats: () => client.stats(), // Embedding stats
    getDatabaseStats: () => client.statistics(), // Graph statistics
  }
}

// Notes (fallback to raw fetch until OpenAPI adds response schemas)
export function useNotesApi() {
  const http = useAuthedFetch()
  return {
  getNotes: () => http.get<any[]>('/api/Notes'),
  getNote: (id: number | string) => http.get<any>(`/api/Notes/${id}`),
  }
}

// Search
export function useSearchApi() {
  const client = useCortexApiClient()
  return {
    search: (request: any) => client.searchPOST(request) as any,
    searchGet: (q: string, k?: number, mode?: string, alpha?: number) => client.searchGET(q, k as any, mode as any, alpha as any) as any,
    advancedSearch: (request: any) => client.advanced(request) as any,
  }
}

// Graph
export function useGraphApi() {
  const client = useCortexApiClient()
  return {
    getGraph: (focus?: string, depth?: number, entityTypes?: string[], fromDate?: string, toDate?: string) =>
      client.graph(focus ?? undefined, depth ?? undefined, entityTypes ?? undefined, fromDate ? new Date(fromDate) : undefined, toDate ? new Date(toDate) : undefined),
    getConnectedEntities: (entityId: string, depth?: number) => client.connected(entityId, depth ?? undefined),
  getEntitySuggestions: (entityId: string) => client.suggestions(entityId),
  getStatistics: () => client.statistics(),
  }
}

// Classification
export function useClassificationApi() {
  const client = useCortexApiClient()
  return {
    classifyNote: (noteId: string) => client.classification(noteId) as any,
    bulkClassify: (request: any) => client.bulk(request) as any,
  }
}

// Chat tools
export function useChatToolsApi() {
  const client = useCortexApiClient()
  return {
    processChat: (request: any) => client.tools(request),
    executeTool: (request: any) => client.execute(request),
    getAvailableTools: () => client.toolsAll(),
  }
}

// User profile API (not fully present in generated client yet)
export function useUserApi() {
  const http = useAuthedFetch()
  return {
    getProfile: () => http.get<any>('/api/User/profile'),
    createOrUpdateProfile: (body: any) => http.post<any>('/api/User/profile', body),
  }
}

// Seed API (not in generated client)
export function useSeedApi() {
  const http = useAuthedFetch()
  return {
    seedIfNeeded: () => http.post<any>('/api/seed-data'),
  }
}

// Voice API convenience
export function useVoiceApi() {
  const { getAccessToken } = useAppAuth()
  return {
    tts: async (text: string) => {
      const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
      const token = await getAccessToken()
      const resp = await fetch(`${baseUrl}/api/Voice/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
      })
      if (!resp.ok) throw new Error(`TTS failed: ${resp.status}`)
      return await resp.blob()
    }
  }
}
