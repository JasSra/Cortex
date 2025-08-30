'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  MicrophoneIcon,
  AdjustmentsHorizontalIcon,
  SparklesIcon,
  ClockIcon,
  FunnelIcon,
  DocumentTextIcon,
  TagIcon,
  XMarkIcon,
  BookmarkIcon,
  ShareIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BoltIcon,
  AcademicCapIcon,
  ChatBubbleLeftRightIcon,
  LightBulbIcon,
  DocumentDuplicateIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline'
import { useMascot } from '@/contexts/MascotContext'
import { useSearchApi, useChatApi, useNotesApi } from '@/services/apiClient'

interface SearchResult {
  id: string
  title: string
  content: string
  score: number
  noteId?: string
  chunkId?: string
  offsets?: number[]
  snippetStart?: number
  metadata: {
    source?: string
    createdAt?: string
    sensitivityLevel?: number
    tags?: string[]
    fileType?: string
    chunkIndex?: number
    wordCount?: number
  }
}

interface SearchStats {
  total: number
  executionTime: number
  semantic: number
  keyword: number
}

interface FilterOptions {
  sensitivityLevels: number[]
  fromDate?: string
  toDate?: string
  fileTypes: string[]
  tags: string[]
  sources: string[]
  minScore?: number
  hasKeywords?: string[]
}

interface SearchMode {
  id: 'simple' | 'semantic' | 'hybrid' | 'ai' | 'expert'
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const searchModes: SearchMode[] = [
  {
    id: 'simple',
    name: 'Simple Search',
    description: 'Quick keyword matching',
    icon: MagnifyingGlassIcon
  },
  {
    id: 'semantic',
    name: 'Semantic Search',
    description: 'Understanding-based search using AI',
    icon: BoltIcon
  },
  {
    id: 'hybrid',
    name: 'Hybrid Search',
    description: 'Best of both keyword and semantic',
    icon: SparklesIcon
  },
  {
    id: 'ai',
    name: 'AI-Powered Search',
    description: 'Conversational search with intelligence',
    icon: ChatBubbleLeftRightIcon
  },
  {
    id: 'expert',
    name: 'Expert Search',
    description: 'Advanced queries with boolean logic',
    icon: AcademicCapIcon
  }
]

const AdvancedSearchPage: React.FC = () => {
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode['id']>('hybrid')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterOptions>({
    sensitivityLevels: [],
    fileTypes: [],
    tags: [],
    sources: []
  })
  const [searchStats, setSearchStats] = useState<SearchStats>({
    total: 0,
    executionTime: 0,
    semantic: 0,
    keyword: 0
  })
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [savedSearches, setSavedSearches] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [aiContext, setAiContext] = useState('')
  const [expertQuery, setExpertQuery] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  // Cache of note metadata to improve titles/snippets
  const [noteMeta, setNoteMeta] = useState<Record<string, { title?: string; content?: string }>>({})

  // Preview modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState<string>('')
  const [previewContent, setPreviewContent] = useState<string>('')
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false)

  const { speak, think, idle, suggest } = useMascot()
  const { searchGet, advancedSearch } = useSearchApi()
  const { ragQuery } = useChatApi()
  const { getNote } = useNotesApi()
  
  const searchInputRef = useRef<HTMLInputElement>(null)
  const recognition = useRef<any>(null)
  const handleSearchRef = useRef<((q?: string) => void) | null>(null)

  // When page changes, re-run search for the current query
  useEffect(() => {
    if (query.trim()) {
      handleSearch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // Search suggestions
  const searchSuggestions = [
    'What is the security policy?',
    'Find documents about encryption',
    'Show me all meeting notes from last month',
    'Technical documentation about authentication',
    'Project timelines and deadlines',
    'Budget reports and financial data'
  ]

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      recognition.current = new (window as any).webkitSpeechRecognition()
      recognition.current!.continuous = false
      recognition.current!.interimResults = false
      recognition.current!.lang = 'en-US'

      recognition.current!.onstart = () => {
        setIsListening(true)
        speak('I\'m listening for your search query', 'thinking')
      }

      recognition.current!.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript
        setQuery(transcript)
        handleSearchRef.current?.(transcript)
        speak(`Searching for "${transcript}"`, 'responding')
      }

      recognition.current!.onend = () => {
        setIsListening(false)
        idle()
      }

      recognition.current!.onerror = (event: any) => {
        setIsListening(false)
        speak('Sorry, I couldn\'t understand that. Please try again.', 'error')
        idle()
      }
    }
  }, [speak, idle])

  // Transform results and helpers (placed before search implementations to avoid TDZ in deps)
  const transformResultsFromResponse = useCallback((response: any): SearchResult[] => {
    const hits = response?.Hits || response?.hits || []
    return hits.map((h: any, index: number) => ({
  id: h.ChunkId || h.NoteId || `result-${index}`,
  title: h.NoteTitle || h.Title || h.FileName || h.Source || `Result ${index + 1}`,
  // Prefer server-provided highlight HTML if available
  content: h.Highlight || h.Snippet || h.Content || '',
  score: h.Score ?? Math.random() * 0.3 + 0.7,
  noteId: h.NoteId,
  chunkId: h.ChunkId,
  offsets: h.Offsets,
  snippetStart: h.SnippetStart,
      metadata: {
        source: h.Source,
        createdAt: h.CreatedAt,
        sensitivityLevel: h.SensitivityLevel ?? 0,
        tags: h.Tags || [],
        fileType: h.FileType,
        chunkIndex: h.ChunkIndex ?? 0,
        wordCount: (h.Content || h.Snippet || '').split(/\s+/).length || 0,
      }
    }))
  }, [])

  const parseExpertQuery = (query: string): string => {
    return query
      .replace(/\bAND\b/gi, ' ')
      .replace(/\bOR\b/gi, ' | ')
      .replace(/\bNOT\b/gi, ' -')
  }

  const applyFilters = useCallback((input: SearchResult[]): SearchResult[] => {
    return input.filter(result => {
      if (filters.sensitivityLevels.length > 0 && 
          !filters.sensitivityLevels.includes(result.metadata.sensitivityLevel || 0)) {
        return false
      }

      if (filters.fromDate && result.metadata.createdAt) {
        if (new Date(result.metadata.createdAt) < new Date(filters.fromDate)) {
          return false
        }
      }
      if (filters.toDate && result.metadata.createdAt) {
        if (new Date(result.metadata.createdAt) > new Date(filters.toDate)) {
          return false
        }
      }

      if (filters.fileTypes.length > 0 && 
          !filters.fileTypes.includes(result.metadata.fileType || '')) {
        return false
      }

      if (filters.minScore && result.score < filters.minScore) {
        return false
      }

      return true
    })
  }, [filters])

  

  // Different search implementations
  const performSimpleSearch = useCallback(async (q: string): Promise<SearchResult[]> => {
    const results = await searchGet(q)
    return transformResultsFromResponse(results)
  }, [searchGet, transformResultsFromResponse])

  const performSemanticSearch = useCallback(async (q: string): Promise<SearchResult[]> => {
    const res = await advancedSearch({
      Q: q,
      Mode: 'semantic',
      K: pageSize,
      Offset: (page - 1) * pageSize,
      Alpha: 0.6,
      SensitivityLevels: filters.sensitivityLevels.length ? filters.sensitivityLevels : undefined,
      FileTypes: filters.fileTypes.length ? filters.fileTypes : undefined,
      Tags: filters.tags.length ? filters.tags : undefined,
      Source: filters.sources?.[0],
      DateFrom: filters.fromDate ? new Date(filters.fromDate).toISOString() : undefined,
      DateTo: filters.toDate ? new Date(filters.toDate).toISOString() : undefined,
    })
    setSearchStats(s => ({ ...s, total: res?.Total ?? res?.total ?? 0 }))
    return transformResultsFromResponse(res)
  }, [advancedSearch, transformResultsFromResponse, filters, page, pageSize])

  const performHybridSearch = useCallback(async (q: string): Promise<SearchResult[]> => {
    const res = await advancedSearch({
      Q: q,
      Mode: 'hybrid',
      K: pageSize,
      Offset: (page - 1) * pageSize,
      Alpha: 0.6,
      SensitivityLevels: filters.sensitivityLevels.length ? filters.sensitivityLevels : undefined,
      FileTypes: filters.fileTypes.length ? filters.fileTypes : undefined,
      Tags: filters.tags.length ? filters.tags : undefined,
      Source: filters.sources?.[0],
      DateFrom: filters.fromDate ? new Date(filters.fromDate).toISOString() : undefined,
      DateTo: filters.toDate ? new Date(filters.toDate).toISOString() : undefined,
    })
    setSearchStats(s => ({ ...s, total: res?.Total ?? res?.total ?? 0 }))
    return transformResultsFromResponse(res)
  }, [advancedSearch, transformResultsFromResponse, filters, page, pageSize])

  const performAISearch = useCallback(async (q: string): Promise<SearchResult[]> => {
    try {
      const messages = [{ role: 'user', content: `${aiContext ? aiContext + '\n\n' : ''}${q}` }]
      await ragQuery(messages, {})
      const res = await advancedSearch({
        Q: q,
        Mode: 'hybrid',
        K: pageSize,
        Offset: (page - 1) * pageSize,
        Alpha: 0.6,
        SensitivityLevels: filters.sensitivityLevels.length ? filters.sensitivityLevels : undefined,
        FileTypes: filters.fileTypes.length ? filters.fileTypes : undefined,
        Tags: filters.tags.length ? filters.tags : undefined,
        Source: filters.sources?.[0],
        DateFrom: filters.fromDate ? new Date(filters.fromDate).toISOString() : undefined,
        DateTo: filters.toDate ? new Date(filters.toDate).toISOString() : undefined,
      })
      setSearchStats(s => ({ ...s, total: res?.Total ?? res?.total ?? 0 }))
      return transformResultsFromResponse(res)
    } catch (error) {
      const res = await advancedSearch({
        Q: q,
        Mode: 'hybrid',
        K: pageSize,
        Offset: (page - 1) * pageSize,
        Alpha: 0.6,
        SensitivityLevels: filters.sensitivityLevels.length ? filters.sensitivityLevels : undefined,
        FileTypes: filters.fileTypes.length ? filters.fileTypes : undefined,
        Tags: filters.tags.length ? filters.tags : undefined,
        Source: filters.sources?.[0],
        DateFrom: filters.fromDate ? new Date(filters.fromDate).toISOString() : undefined,
        DateTo: filters.toDate ? new Date(filters.toDate).toISOString() : undefined,
      })
      setSearchStats(s => ({ ...s, total: res?.Total ?? res?.total ?? 0 }))
      return transformResultsFromResponse(res)
    }
  }, [aiContext, ragQuery, advancedSearch, transformResultsFromResponse, filters, page, pageSize])

  const performExpertSearch = useCallback(async (q: string): Promise<SearchResult[]> => {
    const parsedQuery = parseExpertQuery(expertQuery || q)
    const res = await advancedSearch({
      Q: parsedQuery,
      Mode: 'hybrid',
      K: pageSize,
      Offset: (page - 1) * pageSize,
      Alpha: 0.6,
      SensitivityLevels: filters.sensitivityLevels.length ? filters.sensitivityLevels : undefined,
      FileTypes: filters.fileTypes.length ? filters.fileTypes : undefined,
      Tags: filters.tags.length ? filters.tags : undefined,
      Source: filters.sources?.[0],
      DateFrom: filters.fromDate ? new Date(filters.fromDate).toISOString() : undefined,
      DateTo: filters.toDate ? new Date(filters.toDate).toISOString() : undefined,
    })
    setSearchStats(s => ({ ...s, total: res?.Total ?? res?.total ?? 0 }))
    return transformResultsFromResponse(res)
  }, [expertQuery, advancedSearch, transformResultsFromResponse, filters, page, pageSize])

  // Perform search based on mode
  const handleSearch = useCallback(async (searchQuery?: string) => {
    const queryToSearch = searchQuery || query
    if (!queryToSearch.trim()) return

    setIsSearching(true)
    think()

    try {
      const startTime = Date.now()
      let searchResults: SearchResult[] = []

      switch (searchMode) {
        case 'simple':
          searchResults = await performSimpleSearch(queryToSearch)
          break
        case 'semantic':
          searchResults = await performSemanticSearch(queryToSearch)
          break
        case 'hybrid':
          searchResults = await performHybridSearch(queryToSearch)
          break
        case 'ai':
          searchResults = await performAISearch(queryToSearch)
          break
        case 'expert':
          searchResults = await performExpertSearch(queryToSearch)
          break
      }

      const executionTime = Date.now() - startTime
      const filteredResults = applyFilters(searchResults)

      setResults(filteredResults)
      setSearchStats(prev => ({
        total: prev.total || filteredResults.length,
        executionTime,
        semantic: filteredResults.filter(r => r.score > 0.7).length,
        keyword: filteredResults.filter(r => r.score <= 0.7).length
      }))

      if (!recentSearches.includes(queryToSearch)) {
        setRecentSearches(prev => [queryToSearch, ...prev.slice(0, 4)])
      }

      const resultMessage = filteredResults.length === 0 
        ? 'No results found for your search'
        : `Found ${filteredResults.length} result${filteredResults.length === 1 ? '' : 's'}`
      
      speak(resultMessage, 'responding')

    } catch (error) {
      console.error('Search error:', error)
      speak('Sorry, there was an error searching. Please try again.', 'error')
    } finally {
      setIsSearching(false)
      idle()
    }
  }, [
    query,
    searchMode,
    speak,
    think,
    idle,
    recentSearches,
    performSimpleSearch,
    performSemanticSearch,
    performHybridSearch,
    performAISearch,
    performExpertSearch,
    applyFilters,
  ])

  // Keep a stable ref to the latest handleSearch to use inside speech-recognition callbacks
  useEffect(() => {
    handleSearchRef.current = handleSearch
  }, [handleSearch])

  const clearFilters = () => {
    setFilters({
      sensitivityLevels: [],
      fileTypes: [],
      tags: [],
      sources: []
    })
    speak('All filters cleared!', 'idle')
  }

  const startVoiceSearch = () => {
    if (recognition.current) {
      recognition.current.start()
    } else {
      speak('Voice search is not supported on this browser', 'error')
    }
  }

  const formatSnippet = (content: string, query: string) => {
  if (!content || content.trim().length === 0) return 'No preview available'
  if (!query) return content.substring(0, 200) + '...'
    
  const regex = new RegExp(`(${query.split(' ').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const highlighted = content.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>')
    return highlighted.substring(0, 300) + '...'
  }

  // If we have offsets and snippetStart, try precise highlight inside snippet window
  const renderHighlightedSnippet = (item: SearchResult) => {
    const q = query.trim()
    if (!q) {
      if (!item.content || item.content.length === 0) {
        const fallback = item.noteId ? (noteMeta[item.noteId]?.content || '') : ''
        return formatSnippet(fallback, '')
      }
      return formatSnippet(item.content, '')
    }
    const start = item.snippetStart ?? 0
    const [offStart, offLen] = item.offsets ?? []
    const windowEnd = Math.min(item.content.length, (offStart ? offStart + offLen + 200 : start + 300))
    const snippetStart = Math.max(0, start)
    const snippet = item.content.substring(snippetStart, Math.max(snippetStart, windowEnd || snippetStart + 300))
    if (!snippet || snippet.length === 0) {
      const fallback = item.noteId ? (noteMeta[item.noteId]?.content || '') : ''
      return formatSnippet(fallback, q)
    }
    if (offStart === undefined || offLen === undefined || offStart < 0 || offLen <= 0) {
      return formatSnippet(snippet, q)
    }
    const relStart = Math.max(0, offStart - snippetStart)
    const relEnd = Math.min(snippet.length, relStart + offLen)
    const before = snippet.substring(0, relStart)
    const match = snippet.substring(relStart, relEnd)
    const after = snippet.substring(relEnd)
    const leftEllip = snippetStart > 0 ? '…' : ''
    const rightEllip = (snippetStart + snippet.length) < item.content.length ? '…' : ''
    return `${leftEllip}${before}<mark class="bg-yellow-200 dark:bg-yellow-800">${match}</mark>${after}${rightEllip}`
  }

  const saveSearch = (query: string) => {
    if (!savedSearches.includes(query)) {
      setSavedSearches(prev => [...prev, query])
      speak('Search saved!', 'idle')
    }
  }

  const exportResults = () => {
    const data = {
      query,
      mode: searchMode,
      timestamp: new Date().toISOString(),
      results: results.map(r => ({
        title: r.title,
        content: r.content,
        score: r.score,
        source: r.metadata.source
      }))
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `search-results-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    
    speak('Search results exported!', 'responding')
  }

  // Group results by NoteId with best score ordering
  const groupedResults = React.useMemo(() => {
    const groups = new Map<string, { noteId: string, title: string, items: SearchResult[], bestScore: number }>()
    for (const r of results) {
      const key = r.noteId || r.id
      if (!groups.has(key)) {
        groups.set(key, { noteId: key, title: r.title, items: [r], bestScore: r.score })
      } else {
        const g = groups.get(key)!
        g.items.push(r)
        if (r.score > g.bestScore) g.bestScore = r.score
      }
    }
    return Array.from(groups.values()).sort((a, b) => b.bestScore - a.bestScore)
  }, [results])

  // Backfill missing titles/content per noteId using Notes API
  useEffect(() => {
    const isPlaceholder = (t?: string) => !t || /^result\s+\d+$/i.test(t)
    const uniqueNoteIds = new Set<string>()
    for (const r of results) {
      if (r.noteId) uniqueNoteIds.add(r.noteId)
    }
    const toFetch: string[] = []
  for (const gid of Array.from(uniqueNoteIds)) {
      // If we already have meta, skip
      if (noteMeta[gid]?.title) continue
      // Find any item for this note to check title placeholder
      const sample = results.find(x => x.noteId === gid)
      if (sample && isPlaceholder(sample.title)) toFetch.push(gid)
    }
    if (toFetch.length === 0) return
    // Limit parallelism to avoid flooding
    const batch = toFetch.slice(0, 8)
    let cancelled = false
    ;(async () => {
      const entries: Array<[string, { title?: string; content?: string }]> = []
      await Promise.all(batch.map(async (nid) => {
        try {
          const note = await getNote(nid)
          if (!cancelled && note) {
            entries.push([nid, { title: note.title || note.Title, content: note.content || note.Content }])
          }
        } catch {}
      }))
      if (!cancelled && entries.length) {
        setNoteMeta(prev => ({ ...prev, ...Object.fromEntries(entries) }))
      }
    })()
    return () => { cancelled = true }
  }, [results, getNote, noteMeta])

  const scoreColor = (s: number) => s >= 0.85 ? 'bg-green-500' : s >= 0.7 ? 'bg-yellow-500' : s >= 0.5 ? 'bg-orange-500' : 'bg-red-500'

  // Predeclare width classes so Tailwind can include them; choose nearest 5%
  const WIDTH_CLASSES = [
    'w-[0%]','w-[5%]','w-[10%]','w-[15%]','w-[20%]','w-[25%]','w-[30%]','w-[35%]','w-[40%]','w-[45%]',
    'w-[50%]','w-[55%]','w-[60%]','w-[65%]','w-[70%]','w-[75%]','w-[80%]','w-[85%]','w-[90%]','w-[95%]','w-[100%]'
  ] as const
  const widthClassForScore = (s: number) => {
    const pct = Math.min(100, Math.max(0, Math.round((s * 100) / 5) * 5))
    const idx = Math.round(pct / 5)
    return WIDTH_CLASSES[idx] || 'w-[0%]'
  }

  const openPreview = async (noteId?: string, fallbackTitle?: string) => {
    if (!noteId) return
    try {
      setIsPreviewLoading(true)
      setIsPreviewOpen(true)
      setPreviewTitle(fallbackTitle || 'Preview')
      const note = await getNote(noteId)
      setPreviewTitle(note?.title || fallbackTitle || 'Preview')
      setPreviewContent(note?.content || note?.Content || 'No content available')
    } catch (e) {
      setPreviewContent('Failed to load note')
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const copyGroup = async (items: SearchResult[]) => {
    const text = items.map(i => `• ${i.title}\n${i.content}`).join('\n\n')
    await navigator.clipboard.writeText(text)
    speak('Copied to clipboard', 'idle')
  }

  const shareQuery = async () => {
    const payload = { title: 'Search Results', text: query, url: window.location.href }
    if ((navigator as any).share) {
      try { await (navigator as any).share(payload) } catch {}
    } else {
      await navigator.clipboard.writeText(`${query} — ${window.location.href}`)
      speak('Link copied to clipboard', 'idle')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-4">
            Advanced Search
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Discover insights across your knowledge base with AI-powered search capabilities
          </p>
        </motion.div>

        {/* Search Mode Selector */}
        <motion.div 
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {searchModes.map(mode => {
              const IconComponent = mode.icon
              return (
                <button
                  key={mode.id}
                  onClick={() => setSearchMode(mode.id)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                    searchMode === mode.id
                      ? 'bg-purple-500 text-white shadow-lg'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
                  }`}
                >
                  <IconComponent className="w-4 h-4" />
                  <span className="text-sm font-medium">{mode.name}</span>
                </button>
              )
            })}
          </div>
          
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {searchModes.find(m => m.id === searchMode)?.description}
            </p>
          </div>
        </motion.div>

        {/* AI usage help */}
        <motion.div
          className="max-w-4xl mx-auto mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            onClick={() => setShowHelp(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-left"
          >
            <span className="text-sm font-medium text-gray-900 dark:text-white">How to use AI search effectively</span>
            {showHelp ? <ChevronUpIcon className="w-4 h-4 text-gray-500"/> : <ChevronDownIcon className="w-4 h-4 text-gray-500"/>}
          </button>
          <AnimatePresence>
            {showHelp && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 bg-white dark:bg-gray-800 border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-lg p-4 text-sm text-gray-700 dark:text-gray-300"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Hybrid */}
                  <div className="border-l-4 border-purple-500 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <SparklesIcon className="w-4 h-4 text-purple-500" />
                      <span className="font-medium text-purple-600 dark:text-purple-400">Start with Hybrid</span>
                    </div>
                    <p className="mb-1">Balanced results from keywords + semantic understanding.</p>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <div><span className="font-semibold">When:</span> General discovery; unsure which mode fits.</div>
                      <div><span className="font-semibold">Example:</span> <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono">security policy compliance</code></div>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="border-l-4 border-teal-500 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <FunnelIcon className="w-4 h-4 text-teal-500" />
                      <span className="font-medium text-teal-600 dark:text-teal-400">Use Filters to narrow noise</span>
                    </div>
                    <p className="mb-1">Constrain by date, file type, sensitivity, tags, or source.</p>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <div><span className="font-semibold">When:</span> Too many results or you know the shape.</div>
                      <div><span className="font-semibold">Example:</span> <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono">last 30 days · pdf · confidential</code></div>
                    </div>
                  </div>

                  {/* AI Mode */}
                  <div className="border-l-4 border-emerald-500 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <ChatBubbleLeftRightIcon className="w-4 h-4 text-emerald-500" />
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">AI mode: add context</span>
                    </div>
                    <p className="mb-1">Guide intent with a short brief; refine with follow-ups.</p>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <div><span className="font-semibold">When:</span> You need a conversational, intent-driven search.</div>
                      <div><span className="font-semibold">Example:</span> <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono">Context: Q4 security review · Query: token storage risks</code></div>
                    </div>
                  </div>

                  {/* Expert Mode */}
                  <div className="border-l-4 border-amber-500 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <AcademicCapIcon className="w-4 h-4 text-amber-500" />
                      <span className="font-medium text-amber-600 dark:text-amber-400">Expert: AND / OR / NOT</span>
                    </div>
                    <p className="mb-1">Precision with boolean operators and grouping.</p>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <div><span className="font-semibold">When:</span> You know exact terms and want strict logic.</div>
                      <div><span className="font-semibold">Example:</span> <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono">(encryption AND policy) OR (token AND rotation) NOT deprecated</code></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Main Search Interface */}
        <motion.div 
          className="max-w-4xl mx-auto mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-6">
              {/* AI Context for AI mode */}
              {searchMode === 'ai' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Conversation Context (optional)
                  </label>
                  <textarea
                    value={aiContext}
                    onChange={(e) => setAiContext(e.target.value)}
                    placeholder="Provide context for your search... e.g., 'I'm looking for information related to our Q4 security review'"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={2}
                  />
                </div>
              )}

              {/* Expert Query for Expert mode */}
              {searchMode === 'expert' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Boolean Query (supports AND, OR, NOT)
                  </label>
                  <input
                    type="text"
                    value={expertQuery}
                    onChange={(e) => setExpertQuery(e.target.value)}
                    placeholder="e.g., (security AND policy) OR (encryption AND protocol) NOT deprecated"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              )}

              {/* Main Search Input */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder={
                    searchMode === 'ai' 
                      ? "Ask me anything about your documents..."
                      : searchMode === 'expert'
                      ? "Enter your search terms..."
                      : "What are you looking for?"
                  }
                  className="w-full pl-12 pr-24 py-4 text-lg border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
                
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                  <button
                    onClick={startVoiceSearch}
                    disabled={isListening}
                    title="Voice search"
                    className={`p-2 rounded-lg transition-all ${
                      isListening 
                        ? 'bg-red-100 text-red-600 animate-pulse' 
                        : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900'
                    }`}
                  >
                    <MicrophoneIcon className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    title="Show filters"
                    className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded-lg transition-all"
                  >
                    <AdjustmentsHorizontalIcon className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={() => handleSearch()}
                    disabled={isSearching || !query.trim()}
                    className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all font-medium"
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>

              {/* Search Suggestions */}
              <AnimatePresence>
                {showSuggestions && !query && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {searchSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setQuery(suggestion)
                            setShowSuggestions(false)
                          }}
                          className="text-left p-3 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          <LightBulbIcon className="w-4 h-4 inline mr-2" />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Recent searches:</p>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((search, index) => (
                      <button
                        key={index}
                        onClick={() => setQuery(search)}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-purple-100 dark:hover:bg-purple-800 transition-colors"
                      >
                        {search}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Advanced Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="max-w-4xl mx-auto mb-8 overflow-hidden"
            >
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                    <FunnelIcon className="w-5 h-5 mr-2" />
                    Advanced Filters
                  </h3>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-medium"
                  >
                    Clear All
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Sensitivity Levels */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Sensitivity Level
                    </label>
                    <div className="space-y-2">
                      {[
                        { value: 0, label: 'Public', color: 'green' },
                        { value: 1, label: 'Internal', color: 'yellow' },
                        { value: 2, label: 'Confidential', color: 'orange' },
                        { value: 3, label: 'Secret', color: 'red' }
                      ].map(level => (
                        <label key={level.value} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.sensitivityLevels.includes(level.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilters(prev => ({
                                  ...prev,
                                  sensitivityLevels: [...prev.sensitivityLevels, level.value]
                                }))
                              } else {
                                setFilters(prev => ({
                                  ...prev,
                                  sensitivityLevels: prev.sensitivityLevels.filter(l => l !== level.value)
                                }))
                              }
                            }}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 mr-2"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {level.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Date Range
                    </label>
                    <div className="space-y-3">
                      <input
                        type="date"
                        value={filters.fromDate || ''}
                        onChange={(e) => setFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500"
                        placeholder="From date"
                      />
                      <input
                        type="date"
                        value={filters.toDate || ''}
                        onChange={(e) => setFilters(prev => ({ ...prev, toDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500"
                        placeholder="To date"
                      />
                    </div>
                  </div>

                  {/* File Types */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      File Types
                    </label>
                    <div className="space-y-2">
                      {['pdf', 'docx', 'txt', 'md', 'html', 'xlsx', 'pptx'].map(type => (
                        <label key={type} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.fileTypes.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilters(prev => ({
                                  ...prev,
                                  fileTypes: [...prev.fileTypes, type]
                                }))
                              } else {
                                setFilters(prev => ({
                                  ...prev,
                                  fileTypes: prev.fileTypes.filter(t => t !== type)
                                }))
                              }
                            }}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 mr-2"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300 uppercase font-mono">
                            {type}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Score Threshold */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Minimum Relevance Score
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={filters.minScore || 0}
                      onChange={(e) => setFilters(prev => ({ ...prev, minScore: parseFloat(e.target.value) }))}
                      className="w-full"
                      title="Minimum relevance score"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0%</span>
                      <span className="font-medium">{((filters.minScore || 0) * 100).toFixed(0)}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search Stats and Actions */}
        {searchStats.total > 0 && (
          <motion.div 
            className="max-w-4xl mx-auto mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
                  <span className="flex items-center">
                    <strong className="text-gray-900 dark:text-white">{searchStats.total.toLocaleString()}</strong>
                    <span className="ml-1">results</span>
                  </span>
                  <span className="flex items-center">
                    <ClockIcon className="w-4 h-4 mr-1" />
                    {searchStats.executionTime}ms
                  </span>
                  <span className="flex items-center">
                    <SparklesIcon className="w-4 h-4 mr-1" />
                    {searchStats.semantic} semantic
                  </span>
                  <span className="flex items-center">
                    <MagnifyingGlassIcon className="w-4 h-4 mr-1" />
                    {searchStats.keyword} keyword
                  </span>
                  {Object.values(filters).some(f => Array.isArray(f) ? f.length > 0 : !!f) && (
                    <span className="flex items-center text-purple-600 dark:text-purple-400">
                      <FunnelIcon className="w-4 h-4 mr-1" />
                      Filtered
                    </span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => saveSearch(query)}
                    className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded-lg transition-all"
                    title="Save search"
                  >
                    <BookmarkIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={exportResults}
                    className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded-lg transition-all"
                    title="Export results"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigator.share?.({ title: 'Search Results', text: query, url: window.location.href })}
                    className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded-lg transition-all"
                    title="Share search"
                  >
                    <ShareIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

  {/* Search Results (grouped by note) */}
        <div className="max-w-4xl mx-auto">
          {results.length > 0 && (
            <div className="flex items-center justify-between px-1 pb-2 text-sm text-gray-600 dark:text-gray-400">
              <div>
                Results: <span className="font-medium text-gray-900 dark:text-white">{results.length}</span>
                {typeof (searchStats as any)?.total === 'number' && (
                  <>
                    {' '}of <span className="font-medium text-gray-900 dark:text-white">{searchStats.total}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || isSearching}
                  className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 disabled:opacity-50"
                >Prev</button>
                <span className="text-xs">Page {page}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={isSearching || results.length < pageSize}
                  className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 disabled:opacity-50"
                >Next</button>
              </div>
            </div>
          )}
          {isSearching ? (
            <div className="text-center py-16">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-12 h-12 border-3 border-purple-500 border-t-transparent rounded-full mx-auto mb-6"
              />
              <p className="text-xl text-gray-600 dark:text-gray-400 mb-2">
                {searchMode === 'ai' ? 'AI is analyzing your request...' : 'Searching your knowledge base...'}
              </p>
              <p className="text-sm text-gray-500">
                {searchMode === 'semantic' ? 'Understanding the meaning behind your query' :
                 searchMode === 'hybrid' ? 'Combining semantic understanding with keyword matching' :
                 searchMode === 'expert' ? 'Processing boolean query logic' :
                 'Finding the most relevant information'}
              </p>
            </div>
          ) : results.length > 0 ? (
            <motion.div 
              className="space-y-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {groupedResults.map((group, index) => (
                <motion.div
                  key={group.noteId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer transition-colors" onClick={() => openPreview(group.noteId, noteMeta[group.noteId]?.title || group.title)}>
                        {noteMeta[group.noteId]?.title || group.title}
                      </h3>
                      <div className="mt-2 w-full h-2 bg-gray-100 dark:bg-gray-700 rounded">
                        <div className={`${scoreColor(group.bestScore)} h-2 rounded ${widthClassForScore(group.bestScore)}`} />
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center">
                          Top score: <span className="ml-1 font-medium text-gray-900 dark:text-white">{(group.bestScore * 100).toFixed(1)}%</span>
                        </span>
                        <span className="text-xs text-gray-500">{group.items.length} snippet{group.items.length > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 ml-4">
                      {/* Sensitivity badge: show highest among group if present */}
                      {(() => {
                        const level = Math.max(...group.items.map(i => i.metadata.sensitivityLevel ?? -1))
                        if (level < 0) return null
                        const classes = level === 0 ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
                          level === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100' :
                          level === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100' :
                          'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                        return (
                          <span className={`text-xs px-3 py-1 rounded-full font-medium ${classes}`}>
                            {['Public', 'Internal', 'Confidential', 'Secret'][level]}
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                  {/* Top snippets */}
                  <div className="space-y-3 mb-4">
          {group.items.slice(0, 3).map((item, idx) => (
                      <div key={item.id + '-' + idx} className="text-gray-700 dark:text-gray-300 leading-relaxed">
                        <div className="text-xs text-gray-500 mb-1">Snippet {idx + 1} • {(item.score * 100).toFixed(1)}%</div>
            <div dangerouslySetInnerHTML={{ __html: renderHighlightedSnippet(item) }} />
                      </div>
                    ))}
                    {group.items.length > 3 && (
                      <div className="text-xs text-gray-500">+{group.items.length - 3} more snippets</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {group.items[0]?.metadata.tags && group.items[0].metadata.tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          <TagIcon className="w-4 h-4 text-gray-400" />
                          {group.items[0].metadata.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 px-2 py-1 rounded-full text-xs font-medium">
                              {tag}
                            </span>
                          ))}
                          {group.items[0].metadata.tags.length > 3 && (
                            <span className="text-xs text-gray-500">+{group.items[0].metadata.tags.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <button 
                        className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded-lg transition-all"
                        title="View full document"
                        onClick={() => openPreview(group.noteId, group.title)}
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      <button 
                        className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded-lg transition-all"
                        title="Copy top snippets"
                        onClick={() => copyGroup(group.items)}
                      >
                        <DocumentDuplicateIcon className="w-4 h-4" />
                      </button>
                      <button 
                        className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded-lg transition-all"
                        title="Share"
                        onClick={shareQuery}
                      >
                        <ShareIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : query && !isSearching ? (
            <motion.div 
              className="text-center py-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <SparklesIcon className="w-20 h-20 text-gray-400 mx-auto mb-6" />
              <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">
                No results found
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Try different keywords, adjust your search mode, or clear your filters to expand the search.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={clearFilters}
                  className="px-6 py-2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-medium transition-colors"
                >
                  Clear filters
                </button>
                <button
                  onClick={() => setSearchMode('ai')}
                  className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors font-medium"
                >
                  Try AI Search
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              className="text-center py-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <GlobeAltIcon className="w-20 h-20 text-gray-400 mx-auto mb-6" />
              <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">
                Ready to search your knowledge base
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Use the search bar above to find documents, notes, and insights across your entire knowledge base.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {searchSuggestions.slice(0, 3).map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setQuery(suggestion)
                      handleSearch(suggestion)
                    }}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-800 transition-colors text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Search History Sidebar removed as requested */}

        {/* Preview Modal */}
        <AnimatePresence>
          {isPreviewOpen && (
            <motion.div
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPreviewOpen(false)}
            >
              <motion.div
                className="bg-white dark:bg-gray-900 w-full max-w-3xl rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{previewTitle}</h4>
                  <button aria-label="Close preview" title="Close preview" className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white" onClick={() => setIsPreviewOpen(false)}>
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 max-h-[70vh] overflow-y-auto text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {isPreviewLoading ? 'Loading…' : (previewContent || 'No content available')}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default AdvancedSearchPage
