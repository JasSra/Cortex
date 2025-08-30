"use client"

import { useAppAuth } from '@/hooks/useAppAuth'
import { CortexApiClient } from '@/api/cortex-api-client'
import { useCallback, useMemo } from 'react'
import type {
  NotificationPreferences as NotificationPreferencesModel,
  NotificationHistoryResponse,
  RegisteredDevice,
  DeviceRegistrationRequest,
  TestNotificationRequest,
  TestNotificationResponse,
} from './types/notifications'
import type { VoiceConfigRequest, VoiceConfigValidationResult } from './types/voice'
import type { MascotProfileDto, UpdateMascotProfileRequest } from './types/mascot'

function createAuthedFetch(
  getAccessToken: () => Promise<string | null>,
  onUnauthorized?: () => void
) {
  let handling401 = false
  let consecutive401s = 0
  return async (url: RequestInfo, init?: RequestInit) => {
    const token = await getAccessToken()
    const headers = new Headers(init?.headers || {})
  // Only set JSON content type when the body is a string
  // Do NOT set for FormData or Blob so the browser can set correct boundaries
  const body: any = init?.body as any
  if (!headers.has('Content-Type') && typeof body === 'string') headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(url, { ...(init || {}), headers })
    if ((res.status === 401 || res.status === 403)) {
      consecutive401s++
      if (!handling401) {
        handling401 = true
        try {
          // Only trigger global logout after two consecutive unauthorized responses
          if (consecutive401s >= 2) {
            onUnauthorized && onUnauthorized()
            consecutive401s = 0
          }
        } finally {
          handling401 = false
        }
      }
    } else {
      // reset counter on success
      consecutive401s = 0
    }
    return res
  }
}

// --- Lightweight in-memory TTL cache for deduping frequent calls ---
type CacheEntry<T> = { ts: number; data: T }
const __cache = new Map<string, CacheEntry<any>>()
const __inflight = new Map<string, Promise<any>>()

function getCached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = __cache.get(key) as CacheEntry<T> | undefined
  if (hit && now - hit.ts < ttlMs) return Promise.resolve(hit.data)
  const pending = __inflight.get(key) as Promise<T> | undefined
  if (pending) return pending
  const p = fetcher()
    .then((data) => {
      __cache.set(key, { ts: Date.now(), data })
      __inflight.delete(key)
      return data
    })
    .catch((err) => {
      __inflight.delete(key)
      throw err
    })
  __inflight.set(key, p)
  return p
}

// Main hook: use the generated CortexApiClient everywhere
export function useCortexApiClient(): CortexApiClient {
  const { getAccessToken, logout } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  const fetcher = useMemo(() => createAuthedFetch(getAccessToken, logout), [getAccessToken, logout])
  const client = useMemo(() => new CortexApiClient(baseUrl, { fetch: fetcher }), [baseUrl, fetcher])
  return client
}

// For endpoints not fully typed in OpenAPI, use a minimal authed fetch wrapper
function useAuthedFetch() {
  const { getAccessToken, logout } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  const authedFetch = useMemo(() => createAuthedFetch(getAccessToken, logout), [getAccessToken, logout])

  const get = useCallback(async <T>(path: string): Promise<T> => {
    const res = await authedFetch(`${baseUrl}${path}`)
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }, [authedFetch, baseUrl])

  const post = useCallback(async <T>(path: string, body?: any): Promise<T> => {
    const res = await authedFetch(`${baseUrl}${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }, [authedFetch, baseUrl])

  const del = useCallback(async (path: string): Promise<void> => {
    const res = await authedFetch(`${baseUrl}${path}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`)
  }, [authedFetch, baseUrl])

  const put = useCallback(async <T>(path: string, body?: any): Promise<T> => {
    const res = await authedFetch(`${baseUrl}${path}`, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })
    if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`)
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }, [authedFetch, baseUrl])

  return useMemo(() => ({ get, post, put, del }), [get, post, put, del])
}

// Gamification
export function useGamificationApi() {
  // Use authed fetch because the generated client lacks response schemas (typed as void)
  const http = useAuthedFetch()
  const TTL = 30_000 // 30s cache for sidebar/dashboard widgets

  const getAllAchievements = useCallback(() => getCached('gamification:all', TTL, () => http.get<any[]>('/api/Gamification/achievements')), [http])
  const getMyAchievements = useCallback(() => getCached('gamification:mine', TTL, () => http.get<any[]>('/api/Gamification/my-achievements')), [http])
  const getUserStats = useCallback(async () => getCached('gamification:stats', TTL, async () => {
    const s = await http.get<any>('/api/Gamification/stats')
    return {
      totalNotes: s?.TotalNotes ?? s?.totalNotes ?? 0,
      totalSearches: s?.TotalSearches ?? s?.totalSearches ?? 0,
      totalXp: s?.ExperiencePoints ?? s?.experiencePoints ?? s?.totalXp ?? 0,
      level: s?.Level ?? s?.level ?? 1,
      loginStreak: s?.LoginStreak ?? s?.loginStreak ?? 0,
      lastLoginAt: s?.LastLoginAt ?? s?.lastLoginAt ?? null,
    }
  }), [http])
  const getUserProgress = useCallback(async () => getCached('gamification:progress', TTL, async () => {
    const p = await http.get<any>('/api/Gamification/progress')
    return {
      currentLevel: p?.currentLevel ?? p?.CurrentLevel ?? 1,
      currentXp: p?.currentXP ?? p?.currentXp ?? p?.CurrentXP ?? 0,
      progressToNext: p?.progressToNext ?? p?.ProgressToNext ?? 0,
      totalProgressNeeded: p?.totalProgressNeeded ?? p?.TotalProgressNeeded ?? 0,
      progressPercentage: p?.progressPercentage ?? p?.ProgressPercentage ?? 0,
    }
  }), [http])
  const checkAchievements = useCallback(() => http.post<any>('/api/Gamification/check-achievements'), [http])
  const seedAchievements = useCallback(() => http.post<any>('/api/Gamification/seed'), [http])
  const getAllAchievementsTest = useCallback(() => http.get<any>('/api/Gamification/all-achievements'), [http])

  return useMemo(() => ({
    getAllAchievements,
    getMyAchievements,
    getUserStats,
    getUserProgress,
    checkAchievements,
    seedAchievements,
    getAllAchievementsTest,
  }), [
    getAllAchievements,
    getMyAchievements,
    getUserStats,
    getUserProgress,
    checkAchievements,
    seedAchievements,
    getAllAchievementsTest,
  ])
}

// Admin
export function useAdminApi() {
  const client = useCortexApiClient()
  return {
    reindex: () => client.reindex(),
    reembed: () => client.reembed(),
    healthCheck: () => client.health(),
    getSystemStats: () => client.stats(), // Embedding stats
  }
}

// Notes (fallback to raw fetch until OpenAPI adds response schemas)
export function useNotesApi() {
  const http = useAuthedFetch()
  const TTL = 20_000 // 20s cache
  return useMemo(() => ({
    getNotes: () => getCached('notes:list', TTL, () => http.get<any[]>('/api/Notes')),
    getNote: (id: number | string) => http.get<any>(`/api/Notes/${id}`),
    updateNote: (id: string, content: string, title?: string) => http.put<any>(`/api/Notes/${id}`, { content, title }).then((data) => ({
      noteId: data?.noteId ?? data?.NoteId ?? id,
      title: data?.title ?? data?.Title ?? title ?? '',
      chunkCount: data?.countChunks ?? data?.CountChunks ?? 0,
    })),
  }), [http])
}

// Ingest (multipart uploads and local folder ingest)
export function useIngestApi() {
  const { getAccessToken, logout } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  const authedFetch = useMemo(() => createAuthedFetch(getAccessToken, logout), [getAccessToken, logout])

  const uploadFiles = useCallback(async (files: File[] | FileList) => {
    const token = await getAccessToken()
    const form = new FormData()
    const arr = Array.isArray(files) ? files : Array.from(files)
    for (const f of arr) form.append('files', f, f.name)
    const res = await fetch(`${baseUrl}/api/Ingest/files`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } as any : undefined,
      body: form,
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    const text = await res.text()
    const raw = text ? JSON.parse(text) : []
    // Normalize backend result shape to frontend IngestResult
    return (raw as any[]).map(r => ({
      noteId: r.noteId ?? r.NoteId,
      title: r.title ?? r.Title,
      status: r.status ?? 'ingested',
      chunkCount: r.chunkCount ?? r.CountChunks ?? r.countChunks ?? 0,
      error: r.error,
    }))
  }, [baseUrl, getAccessToken])

  const ingestFolder = useCallback(async (path: string) => {
    const res = await authedFetch(`${baseUrl}/api/Ingest/folder`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
    if (!res.ok) throw new Error(`Folder ingest failed: ${res.status}`)
    const text = await res.text()
    const raw = text ? JSON.parse(text) : []
    return (raw as any[]).map(r => ({
      noteId: r.noteId ?? r.NoteId,
      title: r.title ?? r.Title,
      status: r.status ?? 'ingested',
      chunkCount: r.chunkCount ?? r.CountChunks ?? r.countChunks ?? 0,
      error: r.error,
    }))
  }, [authedFetch, baseUrl])

  const createNote = useCallback(async (content: string, title?: string) => {
    const res = await authedFetch(`${baseUrl}/api/Notes`, {
      method: 'POST',
      body: JSON.stringify({ content, title: title || '' }),
    })
    if (!res.ok) throw new Error(`Create note failed: ${res.status}`)
    const data = await res.json()
    return {
      noteId: data.noteId ?? data.NoteId,
      title: data.title ?? data.Title,
      status: 'created',
      chunkCount: data.chunkCount ?? data.CountChunks ?? data.countChunks ?? 0,
      error: data.error,
    }
  }, [authedFetch, baseUrl])

  return useMemo(() => ({ uploadFiles, ingestFolder, createNote }), [uploadFiles, ingestFolder, createNote])
}

// Search
export function useSearchApi() {
  // Now use the generated client (typed SearchResponse)
  const client = useCortexApiClient()
  const normalize = useCallback((raw: any) => {
    // Accept array or object; produce both Hits and hits for compatibility
    const hits = Array.isArray(raw)
      ? raw
      : (raw?.Hits ?? raw?.hits ?? raw?.Results ?? raw?.results ?? [])
    const total = raw?.Total ?? raw?.total ?? hits.length ?? 0
    const mode = raw?.Mode ?? raw?.mode
    const k = raw?.K ?? raw?.k
    const alpha = raw?.Alpha ?? raw?.alpha
    const durationMs = raw?.DurationMs ?? raw?.durationMs ?? raw?.took ?? undefined
    return { Hits: hits, hits, Total: total, total, Mode: mode, K: k, Alpha: alpha, DurationMs: durationMs }
  }, [])

  const search = useCallback(async (request: any) => {
    const body = {
      q: request?.Q ?? request?.q ?? request?.query ?? '',
      mode: request?.Mode ?? request?.mode ?? 'hybrid',
      k: request?.K ?? request?.k ?? 20,
      alpha: request?.Alpha ?? request?.alpha ?? 0.6,
      filters: request?.Filters ?? request?.filters,
    }
    const res = await client.searchPOST(body as any)
    return normalize(res)
  }, [client, normalize])

  const searchGet = useCallback(async (q: string, k?: number, mode?: string, alpha?: number) => {
    const res = await client.searchGET(q, k, mode, alpha)
    return normalize(res)
  }, [client, normalize])

  const advancedSearch = useCallback(async (request: any) => {
    const body = {
      q: request?.Q ?? request?.q ?? request?.query ?? '',
      mode: request?.Mode ?? request?.mode ?? 'hybrid',
      k: request?.K ?? request?.k ?? 20,
      alpha: request?.Alpha ?? request?.alpha ?? 0.6,
      sensitivityLevels: request?.SensitivityLevels ?? request?.sensitivityLevels,
      fileTypes: request?.FileTypes ?? request?.fileTypes,
      tags: request?.Tags ?? request?.tags,
      source: request?.Source ?? request?.source ?? (Array.isArray(request?.Sources ?? request?.sources) ? (request?.Sources ?? request?.sources)[0] : request?.Sources ?? request?.sources),
      dateFrom: request?.DateFrom ?? request?.dateFrom ?? request?.FromDate ?? request?.fromDate,
      dateTo: request?.DateTo ?? request?.dateTo ?? request?.ToDate ?? request?.toDate,
      excludePii: request?.ExcludePii ?? request?.excludePii,
      excludeSecrets: request?.ExcludeSecrets ?? request?.excludeSecrets,
      piiTypes: request?.PiiTypes ?? request?.piiTypes,
      secretTypes: request?.SecretTypes ?? request?.secretTypes,
    }
    const res = await client.advanced(body as any)
    return normalize(res)
  }, [client, normalize])

  return { search, searchGet, advancedSearch }
}

// Jobs / background processing
export function useJobsApi() {
  const http = useAuthedFetch()
  const { getAccessToken } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  return {
    getStatus: async () => {
      const res = await http.get<any>(`/api/Jobs/status`)
      return {
        summary: res?.summary ?? res?.Summary ?? 'Background workers are idle.',
        pending: res?.pending ?? res?.Pending ?? 0,
        processed: res?.processed ?? res?.Processed ?? 0,
        failed: res?.failed ?? res?.Failed ?? 0,
        avgMs: res?.avgMs ?? res?.AverageMs ?? 0,
        pendingStreams: res?.pendingStreams ?? res?.PendingStreams ?? 0,
        pendingBacklog: res?.pendingBacklog ?? res?.PendingBacklog ?? 0,
        usingStreams: res?.usingStreams ?? res?.UsingStreams ?? false,
        redisConnected: res?.redisConnected ?? res?.RedisConnected ?? false,
      }
    },
    subscribeStatusStream: (onUpdate: (s: { summary: string; pending: number; processed: number; failed: number; avgMs: number; pendingStreams?: number; pendingBacklog?: number; usingStreams?: boolean; redisConnected?: boolean }) => void) => {
      let es: EventSource | null = null
      let closed = false
      ;(async () => {
        try {
          const token = await getAccessToken()
          const url = new URL(`${baseUrl}/api/Jobs/status/stream`)
          if (token) url.searchParams.set('access_token', token)
          if (typeof window !== 'undefined' && 'EventSource' in window) {
            es = new EventSource(url.toString())
            es.onmessage = (ev) => {
              try {
                const data = ev.data ? JSON.parse(ev.data) : {}
                onUpdate({
                  summary: data?.summary ?? data?.Summary ?? 'Background workers are idle.',
                  pending: data?.pending ?? data?.Pending ?? 0,
                  processed: data?.processed ?? data?.Processed ?? 0,
                  failed: data?.failed ?? data?.Failed ?? 0,
                  avgMs: data?.avgMs ?? data?.AverageMs ?? 0,
                  pendingStreams: data?.pendingStreams ?? data?.PendingStreams ?? 0,
                  pendingBacklog: data?.pendingBacklog ?? data?.PendingBacklog ?? 0,
                  usingStreams: data?.usingStreams ?? data?.UsingStreams ?? false,
                  redisConnected: data?.redisConnected ?? data?.RedisConnected ?? false,
                })
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        } finally {
          if (closed && es) es.close()
        }
      })()
      return () => { closed = true; if (es) es.close() }
    }
  }
}

// Graph
export function useGraphApi() {
  const client = useCortexApiClient()
  // Short TTL + inflight dedupe to prevent storms when components mount/re-render
  const TTL = 10_000

  const getGraph = useCallback((focus?: string, depth?: number, entityTypes?: string[], fromDate?: string, toDate?: string) => {
    const key = 'graph:getGraph:' + JSON.stringify({
      f: focus ?? null,
      d: depth ?? null,
      t: (entityTypes ?? []).slice().sort(),
      fd: fromDate ?? null,
      td: toDate ?? null,
    })
    return getCached(key, TTL, () =>
      client.graph(
        focus ?? undefined,
        depth ?? undefined,
        (entityTypes ?? undefined),
        fromDate ? new Date(fromDate) : undefined,
        toDate ? new Date(toDate) : undefined
      )
    )
  }, [client])

  const getConnectedEntities = useCallback((entityId: string, depth?: number) => {
    const key = `graph:connected:${entityId}:${depth ?? ''}`
    return getCached(key, TTL, () => client.connected(entityId, depth ?? undefined))
  }, [client])

  const getEntitySuggestions = useCallback((q: string) => {
    const key = `graph:suggest:${q}`
    return getCached(key, TTL, () => client.suggestions(q))
  }, [client])

  const getStatistics = useCallback(() => getCached('graph:statistics', 30_000, () => client.statistics()), [client])

  return useMemo(() => ({ getGraph, getConnectedEntities, getEntitySuggestions, getStatistics }), [getGraph, getConnectedEntities, getEntitySuggestions, getStatistics])
}

// Classification
export function useClassificationApi() {
  const client = useCortexApiClient()
  return {
    classifyNote: (noteId: string) => client.classification(noteId) as any,
    bulkClassify: (request: any) => client.bulk(request) as any,
  }
}

// Chat tools (thin wrapper around useChatApi)
export function useChatToolsApi() {
  const { chatWithTools, executeTool, getAvailableTools } = useChatApi()
  return {
    chatWithTools,
    executeTool,
    getAvailableTools,
    // Back-compat helper: accept a single request object
    processChat: (request: any) =>
      chatWithTools(
        request?.query ?? request?.Query ?? '',
        request?.availableTools ?? request?.AvailableTools ?? [],
        request?.context ?? request?.Context ?? {}
      ),
  }
}

// User profile API via generated CortexApiClient (prefer generated client over ad-hoc fetch)
export function useUserApi() {
  const client = useCortexApiClient()
  const getProfile = useCallback(() => client.profileGET() as any, [client])
  const createOrUpdateProfile = useCallback((body: any) => client.profilePUT(body) as any, [client])
  const deleteProfile = useCallback(() => client.profileDELETE() as any, [client])
  const getSettings = useCallback(() => client.settingsGET() as any, [client])
  const updateSettings = useCallback((settings: any) => client.settingsPUT(settings) as any, [client])

  return useMemo(() => ({
    getProfile,
    createOrUpdateProfile,
    deleteProfile,
    getSettings,
    updateSettings,
  }), [
    getProfile,
    createOrUpdateProfile,
    deleteProfile,
    getSettings,
    updateSettings,
  ])
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
    },
    ttsStreamUrl: async (text: string) => {
      const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
      const token = await getAccessToken()
      const params = new URLSearchParams({ text })
      if (token) params.set('access_token', token)
      return `${baseUrl}/api/Voice/tts/stream?${params.toString()}`
    },
  ttsTest: async (text?: string) => {
      const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
      const token = await getAccessToken()
      const resp = await fetch(`${baseUrl}/api/Voice/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(text ? { text } : {}),
      })
      if (!resp.ok) throw new Error(`TTS test failed: ${resp.status}`)
      return await resp.blob()
    },
    validateConfig: async (config: Partial<VoiceConfigRequest>) => {
      const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
      const token = await getAccessToken()
      const resp = await fetch(`${baseUrl}/api/Voice/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(config || {}),
      })
      const text = await resp.text()
      const data = text ? JSON.parse(text) : {}
      if (!resp.ok) throw new Error(data?.error || 'Voice config validation failed')
      return data as VoiceConfigValidationResult
    }
  }
}

// Notifications API convenience (uses raw authed fetch wrappers)
export function useNotificationsApi() {
  const http = useAuthedFetch()

  const getPreferences = () => http.get<NotificationPreferencesModel>('/api/Notifications/preferences')
  const updatePreferences = (prefs: NotificationPreferencesModel) => http.put<NotificationPreferencesModel>('/api/Notifications/preferences', prefs)
  const sendTest = (payload?: TestNotificationRequest) => http.post<TestNotificationResponse>('/api/Notifications/test', payload || {})
  const triggerWeeklyDigest = () => http.post<any>('/api/Notifications/weekly-digest', {})
  const getHistory = (limit = 20, offset = 0) => http.get<NotificationHistoryResponse>(`/api/Notifications/history?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`)
  const listDevices = () => http.get<RegisteredDevice[]>('/api/Notifications/devices')
  const registerDevice = (req: DeviceRegistrationRequest) => http.post<any>('/api/Notifications/register-device', req)
  const unregisterDevice = (deviceId: string) => http.del(`/api/Notifications/register-device/${encodeURIComponent(deviceId)}`)

  return {
    getPreferences,
    updatePreferences,
    sendTest,
    triggerWeeklyDigest,
    getHistory,
    listDevices,
    registerDevice,
    unregisterDevice,
  }
}

// AI Assist API (generic suggestions for editor)
export function useAssistApi() {
  const http = useAuthedFetch()
  return {
    assist: (body: { prompt?: string; context?: string; mode?: 'suggest'|'summarize'|'rewrite'; provider?: 'openai'|'ollama'; maxTokens?: number; temperature?: number }) =>
      http.post<{ text: string }>(`/api/Suggestions/assist`, body).then(r => ({ text: (r as any)?.text ?? (r as any)?.Text ?? '' })),
  }
}

// Mascot API convenience
export function useMascotApi() {
  const http = useAuthedFetch()
  return {
    getProfile: () => http.get<MascotProfileDto>('/api/User/mascot-profile'),
    updateProfile: (req: UpdateMascotProfileRequest) => http.put<MascotProfileDto>('/api/User/mascot-profile', req),
  }
}

// Chat API for RAG and Tool-based conversations
export function useChatApi() {
  const http = useAuthedFetch()
  const { getAccessToken } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

  // RAG-based chat query (knowledge base)
  const client = useCortexApiClient()
  const ragQuery = useCallback(async (messages: Array<{role: string, content: string}>, filters?: Record<string, string>) => {
    const request = {
      messages: messages.map(m => [m.role, m.content] as [string, string]),
      topK: 8,
      alpha: 0.6,
      filters: filters
    }
    return await client.query(request as any) as any
  }, [client])

  // RAG streaming chat (Server-Sent Events)
  const ragStreamQuery = useCallback(async (
    messages: Array<{role: string, content: string}>, 
    onChunk: (chunk: string) => void,
    filters?: Record<string, string>
  ) => {
    const request = {
      Messages: messages.map(m => [m.role, m.content] as [string, string]),
      TopK: 8,
      Alpha: 0.6,
      Filters: filters
    }

    const token = await getAccessToken()
  const response = await fetch(`${baseUrl}/api/Rag/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data.trim()) {
              try {
                const parsed = JSON.parse(data)
                if (parsed.Answer) {
                  onChunk(parsed.Answer)
                } else if (parsed.error) {
                  throw new Error(parsed.error)
                }
              } catch (e) {
                // Handle non-JSON chunks
                onChunk(data)
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }, [getAccessToken, baseUrl])

  // RAG streaming with options (supports AbortSignal)
  const ragStreamQuery2 = useCallback(async (
    messages: Array<{role: string, content: string}>, 
    onChunk: (chunk: string) => void,
    options?: { filters?: Record<string, string>, signal?: AbortSignal }
  ) => {
    const request = {
      Messages: messages.map(m => [m.role, m.content] as [string, string]),
      TopK: 8,
      Alpha: 0.6,
      Filters: options?.filters
    }

    const token = await getAccessToken()
    const response = await fetch(`${baseUrl}/api/Rag/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal: options?.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data.trim()) {
              try {
                const parsed = JSON.parse(data)
                if (parsed.Answer) {
                  onChunk(parsed.Answer)
                } else if (parsed.error) {
                  throw new Error(parsed.error)
                }
              } catch (e) {
                onChunk(data)
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }, [getAccessToken, baseUrl])

  // Chat with tools
  const chatWithTools = useCallback(async (
    query: string, 
    availableTools: string[] = [],
    context: Record<string, any> = {}
  ) => {
    const request = {
      query,
      availableTools,
      context
    }
    return await client.tools(request as any) as any
  }, [client])

  // Execute a specific tool (supports (tool, args) and ({ tool/Tool, args/Args }))
  const executeTool = useCallback(async (
    toolOrReq: string | { Tool?: string; tool?: string; Args?: any; args?: any },
    maybeArgs?: any
  ) => {
    const tool = typeof toolOrReq === 'string' ? toolOrReq : (toolOrReq.Tool ?? toolOrReq.tool)
    const args = typeof toolOrReq === 'string' ? maybeArgs : (toolOrReq.Args ?? toolOrReq.args)
    return await client.execute({ tool, parameters: args } as any) as any
  }, [client])

  // Get available tools
  const getAvailableTools = useCallback(async () => {
    return await client.toolsAll() as any
  }, [client])

  return useMemo(() => ({
    ragQuery,
    ragStreamQuery,
    ragStreamQuery2,
    chatWithTools,
    executeTool,
    getAvailableTools,
  }), [ragQuery, ragStreamQuery, ragStreamQuery2, chatWithTools, executeTool, getAvailableTools])
}

// Cards API helpers (Adaptive Card JSON producers)
export function useCardsApi() {
  const http = useAuthedFetch()
  return {
    listNotesCard: () => http.post<any>('/api/Cards/list-notes'),
    noteCard: (id: string) => http.post<any>(`/api/Cards/note/${encodeURIComponent(id)}`),
    confirmDeleteCard: (action?: string) => http.post<any>(`/api/Cards/confirm-delete${action ? `?action=${encodeURIComponent(action)}` : ''}`),
  }
}
