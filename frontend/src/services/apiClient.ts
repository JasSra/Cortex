"use client"

import { useAppAuth } from '@/hooks/useAppAuth'
import { CortexApiClient, PdfUrlIngestRequest, BatchUrlIngestRequest } from '@/api/cortex-api-client'
import { useCallback, useMemo } from 'react'
import type {
  NotificationPreferences as NotificationPreferencesModel,
  NotificationHistoryResponse,
  RegisteredDevice,
  DeviceRegistrationRequest,
  TestNotificationRequest,
  TestNotificationResponse,
} from './types/notifications'
import type { NoteDeletionPlan } from '@/types/api'

interface JobDetails {
  id: string
  type: string
  stream?: string
  enqueuedAt: string
  payload?: any
}
import type { VoiceConfigRequest, VoiceConfigValidationResult } from './types/voice'
import type { MascotProfileDto, UpdateMascotProfileRequest } from './types/mascot'
import type {
  ConfigurationSection,
  ConfigurationUpdateItem,
  ConfigurationValidationResult,
  ProviderTest,
  ConfigurationTestResult
} from './types/configuration'

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

function invalidateCache(key: string): void {
  __cache.delete(key)
  __inflight.delete(key)
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

// Public Health (no auth required)
export function useHealthApi() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  
  const getSystemHealth = useCallback(async () => {
    const response = await fetch(`${baseUrl}/health`)
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`)
    }
    return response.json()
  }, [baseUrl])

  return {
    getSystemHealth,
  }
}

// Admin
export function useAdminApi() {
  const client = useCortexApiClient()
  const { getAccessToken, logout } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  const authedFetch = useMemo(() => createAuthedFetch(getAccessToken, logout), [getAccessToken, logout])
  return {
    reindex: () => client.reindex(),
    reembed: () => client.reembed(),
    // Some admin endpoints require confirmation headers not modeled in OpenAPI
    reembedConfirmed: async () => {
      // Use authed fetch to include the X-Confirm-Delete header
      const res = await authedFetch(`${baseUrl}/api/Admin/reembed`, {
        method: 'POST',
        headers: {
          'X-Confirm-Delete': 'true',
        }
      })
      const text = await res.text()
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`)
      return text ? JSON.parse(text) : { status: 'ok' }
    },
    healthCheck: () => client.health(),
    getSystemStats: () => client.stats(), // Embedding stats
  }
}

// Notes (fallback to raw fetch until OpenAPI adds response schemas)
export function useNotesApi() {
  const http = useAuthedFetch()
  const { getAccessToken, logout } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  const authedFetch = useMemo(() => createAuthedFetch(getAccessToken, logout), [getAccessToken, logout])
  const client = useCortexApiClient()
  
  const TTL = 20_000 // 20s cache
  return useMemo(() => ({
    getNotes: (page = 1, pageSize = 20) => {
      const limit = Math.max(1, Math.min(100, pageSize))
      const offset = Math.max(0, (page - 1) * limit)
      const key = `notes:list:${limit}:${offset}`
      return getCached(key, TTL, async () => {
        const res = await http.get<any[]>(`/api/Notes?limit=${limit}&offset=${offset}&includeContent=false`)
        return res
      })
    },
    getNote: (id: number | string) => http.get<any>(`/api/Notes/${id}`),
    // Optional 4th param to skip heavy processing (autosave)
    updateNote: (id: string, content: string, title?: string, skipProcessing?: boolean) => http.put<any>(`/api/Notes/${id}`, { content, title, skipProcessing: !!skipProcessing }).then((data) => ({
      noteId: data?.noteId ?? data?.NoteId ?? id,
      title: data?.title ?? data?.Title ?? title ?? '',
      chunkCount: data?.countChunks ?? data?.CountChunks ?? 0,
    })),
    deleteNote: async (id: string) => {
      const response = await authedFetch(`${baseUrl}/api/Notes/${id}`, {
        method: 'DELETE',
        headers: {
          'X-Confirm-Delete': 'true'
        }
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Delete failed: ${response.status} ${errorText}`)
      }
      return response.json().catch(() => ({ success: true }))
    },
    getDeletionPlan: async (id: string): Promise<NoteDeletionPlan> => {
      const response = await authedFetch(`${baseUrl}/api/Notes/${id}/deletion-plan`, {
        method: 'GET'
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to get deletion plan: ${response.status} ${errorText}`)
      }
      return response.json()
    },
    togglePin: async (noteId: string, isPinned: boolean) => {
      const { PinRequest } = await import('../api/cortex-api-client')
      const pinRequest = new PinRequest({ isPinned })
      return await client.pin(noteId, pinRequest)
    },
  }), [http, authedFetch, baseUrl, client])
}

// Ingest (multipart uploads and local folder ingest)
export function useIngestApi() {
  const { getAccessToken, logout } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  const authedFetch = useMemo(() => createAuthedFetch(getAccessToken, logout), [getAccessToken, logout])

  // Retry helper with exponential backoff
  const retry = useCallback(async <T,>(fn: () => Promise<T>, attempts = 3, baseDelay = 400): Promise<T> => {
    let lastErr: any
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn()
      } catch (e: any) {
        lastErr = e
        // network-ish errors: retry
        const msg = String(e?.message || '')
        const shouldRetry = /NetworkError|Failed to fetch|ECONNRESET|ETIMEDOUT|429|5\d{2}/i.test(msg)
        if (!shouldRetry) break
        const delay = baseDelay * Math.pow(2, i) + Math.floor(Math.random() * 150)
        await new Promise(res => setTimeout(res, delay))
      }
    }
    throw lastErr
  }, [])

  // NEW: upload files sequentially, one request per file with retries
  const uploadFiles = useCallback(async (files: File[] | FileList): Promise<import('@/types/api').IngestResult[]> => {
    const token = await getAccessToken()
    const arr = Array.isArray(files) ? files : Array.from(files)

  const results: import('@/types/api').IngestResult[] = []

    // process each file sequentially
    for (const f of arr) {
      const form = new FormData()
      form.append('files', f, f.name)

      const doUpload = async () => {
        const res = await fetch(`${baseUrl}/api/Ingest/files`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } as any : undefined,
          body: form,
        })
        if (!res.ok) {
          const errorText = await res.text()
          throw new Error(`Upload failed: ${res.status} - ${errorText}`)
        }
        const text = await res.text()
        const raw = text ? JSON.parse(text) : []
        // Backend returns an array; for single file expect array length 0 or 1
        const item = Array.isArray(raw) ? raw[0] : raw
        return item
      }

      try {
        const item = await retry(doUpload)
        results.push({
          noteId: item?.noteId ?? item?.NoteId ?? '',
          title: item?.title ?? item?.Title ?? f.name,
          status: (item?.status ?? 'ingested') as string,
          chunkCount: item?.chunkCount ?? item?.CountChunks ?? item?.countChunks ?? 0,
          error: item?.error,
        })
      } catch (e: any) {
        results.push({
          noteId: '',
          title: f.name,
          status: 'error',
          chunkCount: 0,
          error: e?.message || 'Upload failed',
        })
      }
    }

    return results
  }, [baseUrl, getAccessToken, retry])

  const ingestFolder = useCallback(async (path: string): Promise<import('@/types/api').IngestResult[]> => {
    const res = await authedFetch(`${baseUrl}/api/Ingest/folder`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
    if (!res.ok) throw new Error(`Folder ingest failed: ${res.status}`)
    const text = await res.text()
    const raw = text ? JSON.parse(text) : []
    return (raw as any[]).map(r => ({
      noteId: r.noteId ?? r.NoteId ?? '',
      title: r.title ?? r.Title ?? '',
      status: r.status ?? 'ingested',
      chunkCount: r.chunkCount ?? r.CountChunks ?? r.countChunks ?? 0,
      error: r.error,
    }))
  }, [authedFetch, baseUrl])

  const createNote = useCallback(async (content: string, title?: string): Promise<import('@/types/api').IngestResult> => {
    const res = await authedFetch(`${baseUrl}/api/Notes`, {
      method: 'POST',
      body: JSON.stringify({ content, title: title || '' }),
    })
    if (!res.ok) throw new Error(`Create note failed: ${res.status}`)
    const data = await res.json()
    return {
      noteId: data.noteId ?? data.NoteId ?? '',
      title: data.title ?? data.Title ?? (title || ''),
      status: 'created',
      chunkCount: data.chunkCount ?? data.CountChunks ?? data.countChunks ?? 0,
      error: data.error,
    }
  }, [authedFetch, baseUrl])

  const ingestUrlContent = useCallback(async (urlData: {
    url: string
    title?: string
    content: string
    finalUrl?: string
    siteName?: string
    byline?: string
    publishedTime?: string
  }) => {
    const res = await authedFetch(`${baseUrl}/api/Ingest/url-content`, {
      method: 'POST',
      body: JSON.stringify(urlData),
    })
    if (!res.ok) throw new Error(`URL ingestion failed: ${res.status}`)
    const data = await res.json()
    return {
      noteId: data.noteId ?? data.NoteId ?? '',
      title: data.title ?? data.Title ?? (urlData.title || ''),
      status: data.status ?? 'success',
      chunkCount: data.countChunks ?? data.CountChunks ?? data.countChunks ?? 0,
      originalUrl: data.originalUrl ?? data.OriginalUrl,
      finalUrl: data.finalUrl ?? data.FinalUrl,
      error: data.error,
    } as any
  }, [authedFetch, baseUrl])

  return useMemo(() => ({ uploadFiles, ingestFolder, createNote, ingestUrlContent }), [uploadFiles, ingestFolder, createNote, ingestUrlContent])
}

// Advanced URL ingest operations - PDFs, batch processing, etc.
export function useAdvancedUrlIngestApi() {
  const client = useCortexApiClient()
  
  const ingestPdfFromUrl = useCallback(async (url: string, title?: string) => {
    try {
      const request = new PdfUrlIngestRequest({ url, title })
      await client.pdf(request)
      // Since the backend returns void, we'll return a simple success indicator
      return { success: true, url, title }
    } catch (error) {
      console.error('PDF ingestion failed:', error)
      throw error
    }
  }, [client])
  
  const ingestUrlBatch = useCallback(async (urls: string[], maxConcurrent: number = 3) => {
    try {
      const request = new BatchUrlIngestRequest({ urls, maxConcurrent })
      await client.batch(request)
      // Since the backend returns void, we'll return a simple success indicator
      return { success: true, processedCount: urls.length }
    } catch (error) {
      console.error('Batch URL ingestion failed:', error)
      throw error
    }
  }, [client])
  
  return useMemo(() => ({ 
    ingestPdfFromUrl, 
    ingestUrlBatch 
  }), [ingestPdfFromUrl, ingestUrlBatch])
}

// Tags - now using the generated client with proper types
export function useTagsApi() {
  const client = useCortexApiClient()
  const http = useAuthedFetch()
  const TTL = 30_000 // 30s cache for tag data

  const getAllTags = useCallback(async () => {
    return getCached('tags:all', TTL, async () => {
      const response = await client.tags()
      return response.tags || []
    })
  }, [client])

  const getNoteTags = useCallback(async (noteId: string) => {
    const response = await client.tags2(noteId)
    return response.tags || []
  }, [client])

  const getAll = useCallback(() => http.get<any>('/api/Tags'), [http])
  const getForNote = useCallback((noteId: string) => http.get<any>(`/api/Tags/${encodeURIComponent(noteId)}`), [http])
  const addToNote = useCallback(async (noteId: string, tags: string[]) => {
    const body = { noteIds: [noteId], add: tags }
    return await http.post<any>('/api/Tags/bulk', body)
  }, [http])
  const removeFromNote = useCallback(async (noteId: string, tags: string[]) => {
    const body = { noteIds: [noteId], remove: tags }
    return await http.post<any>('/api/Tags/bulk', body)
  }, [http])
  const addToNotes = useCallback(async (noteIds: string[], tags: string[]) => {
    const body = { noteIds, add: tags }
    return await http.post<any>('/api/Tags/bulk', body)
  }, [http])
  const removeFromNotes = useCallback(async (noteIds: string[], tags: string[]) => {
    const body = { noteIds, remove: tags }
    return await http.post<any>('/api/Tags/bulk', body)
  }, [http])

  const searchNotesByTags = useCallback(async (
    tags: string[] | string,
    options: {
      mode?: 'all' | 'any'
      limit?: number
      offset?: number
    } = {}
  ) => {
    const {
      mode = 'all',
      limit = 20,
      offset = 0
    } = options

    const tagString = Array.isArray(tags) ? tags.join(',') : tags
    const response = await client.search(tagString, mode, limit, offset)
    
    return {
      items: response.items || [],
      total: response.total || 0,
      offset: response.offset || 0,
      limit: response.limit || limit
    }
  }, [client])

  return useMemo(() => ({
    // Generated-client helpers
    getAllTags,
    getNoteTags,
    searchNotesByTags,
    // Raw helpers used by editor flows
    getAll,
    getForNote,
    addToNote,
    removeFromNote,
    addToNotes,
    removeFromNotes,
  }), [
    getAllTags,
    getNoteTags,
    searchNotesByTags,
    getAll,
    getForNote,
    addToNote,
    removeFromNote,
    addToNotes,
    removeFromNotes,
  ])
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

  const searchGet = useCallback(async (q: string, k?: number, mode?: string, alpha?: number, offset?: number) => {
    const res = await client.searchGET(q, k, offset, mode, alpha)
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
  const client = useCortexApiClient()
  const { getAccessToken } = useAppAuth()
  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  
  const getStatus = useCallback(async () => {
    const res = await http.get<any>(`/api/Jobs/status`)
    return {
      summary: res?.summary ?? res?.Summary ?? 'Background workers are idle.',
      pending: res?.pending ?? res?.Pending ?? 0,
      processed: res?.processed ?? res?.Processed ?? 0,
      failed: res?.failed ?? res?.Failed ?? 0,
  avgMs: res?.avgMs ?? res?.AverageMs ?? 0,
    }
  }, [http])

  const getPendingJobs = useCallback(async (): Promise<JobDetails[]> => {
    return await http.get<JobDetails[]>(`/api/Jobs/pending`)
  }, [http])

  const getJobDetails = useCallback(async () => {
    const res = await http.get<any>(`/api/Jobs/details`)
    return {
      summary: res?.summary ?? res?.Summary ?? 'Background workers are idle.',
      pending: res?.pending ?? res?.Pending ?? 0,
      processed: res?.processed ?? res?.Processed ?? 0,
      failed: res?.failed ?? res?.Failed ?? 0,
  avgMs: res?.avgMs ?? res?.AverageMs ?? 0,
      lastUpdated: res?.lastUpdated ?? res?.LastUpdated ?? new Date().toISOString(),
      performanceMetrics: res?.performanceMetrics ?? res?.PerformanceMetrics ?? {},
      jobTypes: res?.jobTypes ?? res?.JobTypes ?? []
    }
  }, [http])

  const statusStreamUrl = useCallback(async () => {
    const token = await getAccessToken()
    const url = new URL(`${baseUrl}/api/Jobs/status/stream`)
    if (token) url.searchParams.set('access_token', token)
    return url.toString()
  }, [getAccessToken, baseUrl])

  return {
    // One-shot status (normalized)
    getStatus,
    // Get detailed pending jobs information
    getPendingJobs,
    // Get comprehensive job details with performance metrics
    getJobDetails,
    // Helper to build SSE URL with token
    statusStreamUrl,
    // Subscribe and push normalized updates
  subscribeStatusStream: (onUpdate: (s: { summary: string; pending: number; processed: number; failed: number; avgMs: number }) => void) => {
      let es: EventSource | null = null
      let closed = false
      ;(async () => {
        try {
          const url = await (async () => {
            const token = await getAccessToken()
            const u = new URL(`${baseUrl}/api/Jobs/status/stream`)
            if (token) u.searchParams.set('access_token', token)
            return u.toString()
          })()
          if (typeof window !== 'undefined' && 'EventSource' in window) {
            es = new EventSource(url)
            es.onmessage = (ev) => {
              try {
                const data = ev.data ? JSON.parse(ev.data) : {}
                onUpdate({
                  summary: data?.summary ?? data?.Summary ?? 'Background workers are idle.',
                  pending: data?.pending ?? data?.Pending ?? 0,
                  processed: data?.processed ?? data?.Processed ?? 0,
                  failed: data?.failed ?? data?.Failed ?? 0,
          avgMs: data?.avgMs ?? data?.AverageMs ?? 0,
                })
              } catch {}
            }
          }
        } catch {
        } finally {
          if (closed && es) es.close()
        }
      })()
      return () => { closed = true; if (es) es.close() }
    },
    // Enqueue server-side graph enrich (requires Redis)
    enqueueGraphEnrich: (noteId?: string) => {
      return noteId
        ? http.post<any>(`/api/Jobs/graph-enrich/${encodeURIComponent(noteId)}`)
        : http.post<any>('/api/Jobs/graph-enrich', {})
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
    // Guard: backend requires an entityId; skip for empty/undefined
    if (!q || (typeof q === 'string' && q.trim().length === 0)) {
      return Promise.resolve([] as any)
    }
    const key = `graph:suggest:${q}`
    return getCached(key, TTL, () => client.suggestions(q))
  }, [client])

  const getStatistics = useCallback(() => getCached('graph:statistics', 30_000, () => client.statistics()), [client])

  // Trigger server-side relationship discovery (no params)
  const discoverAll = useCallback(async () => {
    // Use raw fetch via client.http or reuse authed fetch
    const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
    const res = await (client as any).http.fetch(`${baseUrl}/api/Graph/discover/all`, { method: 'POST', headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Discover all failed: ${res.status}`)
    return await res.json().catch(() => ({}))
  }, [client])

  // Rebuild the graph
  const rebuildGraph = useCallback(async () => {
    return await client.rebuild()
  }, [client])

  // Link two entities
  const linkEntities = useCallback(async (fromEntityId: string, toEntityId: string, relationType: string, confidence?: number) => {
    return await client.linkPOST(fromEntityId, toEntityId, relationType, confidence)
  }, [client])

  // Unlink two entities
  const unlinkEntities = useCallback(async (fromEntityId: string, toEntityId: string) => {
    return await client.linkDELETE(fromEntityId, toEntityId)
  }, [client])

  // Get entity notes - placeholder implementation (search for notes related to entity)
  const getEntityNotes = useCallback(async (entityId: string) => {
    // This might need to be implemented via search or a different endpoint
    // For now, return empty array as placeholder
    return []
  }, [])

  // Get connection suggestions - placeholder using existing suggestions method
  const getConnectionSuggestions = useCallback(async (entityId: string, limit?: number) => {
    return await getEntitySuggestions(entityId)
  }, [getEntitySuggestions])

  // Get global suggestions - placeholder implementation
  const getGlobalSuggestions = useCallback(async (limit?: number) => {
    // This might need a different endpoint or approach
    return []
  }, [])

  // Apply a suggestion - placeholder implementation using linkEntities
  const applySuggestion = useCallback(async (suggestion: any) => {
    return await linkEntities(suggestion.fromEntityId, suggestion.toEntityId, suggestion.suggestedRelationType)
  }, [linkEntities])

  return useMemo(() => ({ 
    getGraph, 
    getConnectedEntities, 
    getEntitySuggestions, 
    getStatistics, 
    discoverAll,
    rebuildGraph,
    linkEntities,
    unlinkEntities,
    getEntityNotes,
    getConnectionSuggestions,
    getGlobalSuggestions,
    applySuggestion
  }), [
    getGraph, 
    getConnectedEntities, 
    getEntitySuggestions, 
    getStatistics, 
    discoverAll,
    rebuildGraph,
    linkEntities,
    unlinkEntities,
    getEntityNotes,
    getConnectionSuggestions,
    getGlobalSuggestions,
    applySuggestion
  ])
}

// Classification
export function useClassificationApi() {
  const client = useCortexApiClient()
  // Dedupe repeated classification calls per-note for a short TTL
  const TTL = 60_000 // 60s
  return {
    classifyNote: (noteId: string) => {
      const key = `classify:${noteId}`
      return getCached(key, TTL, () => client.classification(noteId) as any)
    },
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
  const deleteData = useCallback(() => client.data() as any, [client])
  const getSettings = useCallback(() => client.settingsGET() as any, [client])
  const updateSettings = useCallback((settings: any) => client.settingsPUT(settings) as any, [client])

  return useMemo(() => ({
    getProfile,
    createOrUpdateProfile,
    deleteProfile,
    deleteData,
    getSettings,
    updateSettings,
  }), [
    getProfile,
    createOrUpdateProfile,
    deleteProfile,
    deleteData,
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

// Jobs API (enqueue + status + SSE URL)
// (duplicate useJobsApi removed; consolidated earlier)

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

// Tags API
// (merged into the main useTagsApi above)

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
    
    // AI Summary generation
    generateSummary: (body: { content: string; maxLength?: number }) =>
      http.post<{ summary: string; wordCount: number }>(`/api/Suggestions/summary`, body),
    
    // AI Classification
    classifyContent: (body: { content: string; noteId?: string }) =>
      http.post<{
        noteId: string;
        tags: string[];
        sensitivity: number;
        sensitivityScore: number;
        pii: string[];
        secrets: string[];
        summary: string;
        confidence: number;
        processedAt: string;
        error?: string;
      }>(`/api/Suggestions/classify`, body),
  }
}

// Suggestions API - AI-powered suggestions and insights
export function useSuggestionsApi() {
  const http = useAuthedFetch()
  return {
    // Note title suggestion
    suggestNoteTitle: (body: { content: string }) =>
      http.post<{ title: string }>(`/api/Suggestions/note-title`, body).then(r => (r as any)?.title ?? ''),
    
    // Summary generation
    generateSummary: (body: { content: string; maxLength?: number }) =>
      http.post<{ summary: string; wordCount: number }>(`/api/Suggestions/summary`, body),
    
    // Content classification
    classifyContent: (body: { content: string; noteId?: string }) =>
      http.post<{
        noteId: string;
        tags: string[];
        suggestedTags: string[];
        sensitivity: number;
        sensitivityScore: number;
        pii: string[];
        secrets: string[];
        summary: string;
        confidence: number;
        processedAt: string;
        error?: string;
      }>(`/api/Suggestions/classify`, body),
    
    // Proactive suggestions
    getProactiveSuggestions: (limit = 5) =>
      http.get<Array<{
        type: string;
        title: string;
        description: string;
        actionUrl: string;
        priority: string;
        estimatedTimeMinutes: number;
      }>>(`/api/Suggestions/proactive?limit=${limit}`),
    
    // Entity insights
    getEntityInsights: () =>
      http.get<{
        topEntities: string[];
        recentConnections: string[];
        suggestedExplorations: string[];
      }>(`/api/Suggestions/insights`),
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

// Workspace API - User workspace management with recent notes and editor state
export function useWorkspaceApi() {
  const http = useAuthedFetch()
  const TTL = 5_000 // 5s cache for workspace data
  
  const getWorkspace = useCallback(() => {
    return getCached('workspace:current', TTL, () => http.get<any>('/api/Workspace'))
  }, [http])
  
  const updateWorkspace = useCallback(async (updates: {
    activeNoteId?: string | null
    recentNoteIds?: string[]
    editorState?: Record<string, any>
    pinnedTags?: string[]
    layoutPreferences?: Record<string, any>
  }) => {
    const result = await http.put<any>('/api/Workspace', updates)
    // Invalidate cache after update
    invalidateCache('workspace:current')
    return result
  }, [http])
  
  const getRecentNotes = useCallback((limit = 10) => {
    return http.get<any[]>(`/api/Workspace/recent-notes?limit=${limit}`)
  }, [http])
  
  const trackNoteAccess = useCallback(async (noteId: string, accessType = 'view', durationSeconds = 0, editorState?: Record<string, any>) => {
    const body = {
      noteId,
      accessType,
      durationSeconds,
      editorStateSnapshot: editorState ? JSON.stringify(editorState) : null
    }
    return await http.post<any>('/api/Workspace/track-access', body)
  }, [http])
  
  const getNotesByTags = useCallback((tags: string[], mode: 'all' | 'any' = 'all', limit = 20, offset = 0) => {
    const tagQuery = tags.join(',')
    return http.get<any[]>(`/api/Workspace/notes-by-tags?tags=${encodeURIComponent(tagQuery)}&mode=${mode}&limit=${limit}&offset=${offset}`)
  }, [http])
  
  const getAllTags = useCallback(() => {
    return getCached('workspace:tags', 30_000, () => http.get<string[]>('/api/Workspace/tags'))
  }, [http])
  
  return useMemo(() => ({
    getWorkspace,
    updateWorkspace,
    getRecentNotes,
    trackNoteAccess,
    getNotesByTags,
    getAllTags,
  }), [
    getWorkspace,
    updateWorkspace,
    getRecentNotes,
    trackNoteAccess,
    getNotesByTags,
    getAllTags,
  ])
}

// Configuration API - System configuration management
export function useConfigurationApi() {
  const http = useAuthedFetch()
  
  const getAllConfiguration = useCallback(() => {
    return http.get<ConfigurationSection[]>('/api/Configuration')
  }, [http])
  
  const getConfigurationSection = useCallback((section: string) => {
    return http.get<ConfigurationSection>(`/api/Configuration/${encodeURIComponent(section)}`)
  }, [http])
  
  const updateConfiguration = useCallback(async (updates: ConfigurationUpdateItem[]) => {
    const request = { Settings: updates }
    return await http.post<any>('/api/Configuration', request)
  }, [http])
  
  const validateConfiguration = useCallback(async (settings: ConfigurationUpdateItem[]) => {
    const request = { Settings: settings }
    return await http.post<ConfigurationValidationResult>('/api/Configuration/validate', request)
  }, [http])
  
  const getConfigurationValue = useCallback((key: string) => {
    return http.get<{key: string, value: string}>(`/api/Configuration/value/${encodeURIComponent(key)}`)
  }, [http])
  
  const setConfigurationValue = useCallback(async (key: string, value: string) => {
    const request = { Value: value }
    return await http.post<any>(`/api/Configuration/value/${encodeURIComponent(key)}`, request)
  }, [http])
  
  const testConfiguration = useCallback(async (tests: ProviderTest[]) => {
    const request = { Tests: tests }
    return await http.post<ConfigurationTestResult>('/api/Configuration/test', request)
  }, [http])
  
  return useMemo(() => ({
    getAllConfiguration,
    getConfigurationSection,
    updateConfiguration,
    validateConfiguration,
    getConfigurationValue,
    setConfigurationValue,
    testConfiguration,
  }), [
    getAllConfiguration,
    getConfigurationSection,
    updateConfiguration,
    validateConfiguration,
    getConfigurationValue,
    setConfigurationValue,
    testConfiguration,
  ])
}
