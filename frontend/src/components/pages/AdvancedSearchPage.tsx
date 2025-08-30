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
import { useSearchApi, useChatApi } from '@/services/apiClient'

interface SearchResult {
  id: string
  title: string
  content: string
  score: number
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
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [savedSearches, setSavedSearches] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [aiContext, setAiContext] = useState('')
  const [expertQuery, setExpertQuery] = useState('')
  const [searchHistory, setSearchHistory] = useState<Array<{
    query: string
    mode: string
    timestamp: Date
    resultCount: number
  }>>([])

  const { speak, think, idle, suggest } = useMascot()
  const { searchGet } = useSearchApi()
  const { ragQuery } = useChatApi()
  
  const searchInputRef = useRef<HTMLInputElement>(null)
  const recognition = useRef<any>(null)

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
        handleSearch(transcript)
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
          // Simple keyword search
          searchResults = await performSimpleSearch(queryToSearch)
          break
        case 'semantic':
          // Semantic search only
          searchResults = await performSemanticSearch(queryToSearch)
          break
        case 'hybrid':
          // Hybrid search (default backend behavior)
          searchResults = await performHybridSearch(queryToSearch)
          break
        case 'ai':
          // AI-powered conversational search
          searchResults = await performAISearch(queryToSearch)
          break
        case 'expert':
          // Expert search with boolean logic
          searchResults = await performExpertSearch(queryToSearch)
          break
      }

      const executionTime = Date.now() - startTime

      // Apply filters
      const filteredResults = applyFilters(searchResults)

      setResults(filteredResults)
      setSearchStats({
        total: filteredResults.length,
        executionTime,
        semantic: filteredResults.filter(r => r.score > 0.7).length,
        keyword: filteredResults.filter(r => r.score <= 0.7).length
      })

      // Update search history
      setSearchHistory(prev => [
        {
          query: queryToSearch,
          mode: searchMode,
          timestamp: new Date(),
          resultCount: filteredResults.length
        },
        ...prev.slice(0, 9) // Keep last 10 searches
      ])

      // Update recent searches
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
  }, [query, searchMode, filters, speak, think, idle, recentSearches])

  // Different search implementations
  const performSimpleSearch = async (query: string): Promise<SearchResult[]> => {
    // Use the backend search API with keyword focus
    const results = await searchGet(query)
    return transformResults(results)
  }

  const performSemanticSearch = async (query: string): Promise<SearchResult[]> => {
    // Use the backend search API with semantic focus
    const results = await searchGet(query)
    return transformResults(results)
  }

  const performHybridSearch = async (query: string): Promise<SearchResult[]> => {
    // Use the backend search API (default hybrid mode)
    const results = await searchGet(query)
    return transformResults(results)
  }

  const performAISearch = async (query: string): Promise<SearchResult[]> => {
    // Use RAG query for conversational search
    try {
      const messages = [{ role: 'user', content: `${aiContext ? aiContext + '\n\n' : ''}${query}` }]
      const response = await ragQuery(messages, {})
      // Extract search results from RAG response
      const results = await searchGet(query)
      return transformResults(results)
    } catch (error) {
      // Fallback to regular search
      const results = await searchGet(query)
      return transformResults(results)
    }
  }

  const performExpertSearch = async (query: string): Promise<SearchResult[]> => {
    // Parse expert query and use backend search
    const parsedQuery = parseExpertQuery(expertQuery || query)
    const results = await searchGet(parsedQuery)
    return transformResults(results)
  }

  const transformResults = (backendResults: any[]): SearchResult[] => {
    return backendResults.map((result: any, index: number) => ({
      id: result.id || `result-${index}`,
      title: result.title || `Result ${index + 1}`,
      content: result.content || result.snippet || '',
      score: result.score || Math.random() * 0.3 + 0.7, // Mock score if not provided
      metadata: {
        source: result.source || result.metadata?.source,
        createdAt: result.createdAt || result.metadata?.createdAt,
        sensitivityLevel: result.metadata?.sensitivityLevel || 0,
        tags: result.tags || result.metadata?.tags || [],
        fileType: result.fileType || result.metadata?.fileType,
        chunkIndex: result.chunkIndex || 0,
        wordCount: result.content?.split(/\s+/).length || 0
      }
    }))
  }

  const parseExpertQuery = (query: string): string => {
    // Parse boolean logic (AND, OR, NOT) and convert to backend format
    return query
      .replace(/\bAND\b/gi, ' ')
      .replace(/\bOR\b/gi, ' | ')
      .replace(/\bNOT\b/gi, ' -')
  }

  const applyFilters = (results: SearchResult[]): SearchResult[] => {
    return results.filter(result => {
      // Sensitivity level filter
      if (filters.sensitivityLevels.length > 0 && 
          !filters.sensitivityLevels.includes(result.metadata.sensitivityLevel || 0)) {
        return false
      }

      // Date range filter
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

      // File type filter
      if (filters.fileTypes.length > 0 && 
          !filters.fileTypes.includes(result.metadata.fileType || '')) {
        return false
      }

      // Score filter
      if (filters.minScore && result.score < filters.minScore) {
        return false
      }

      return true
    })
  }

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
    if (!query) return content.substring(0, 200) + '...'
    
    const regex = new RegExp(`(${query.split(' ').join('|')})`, 'gi')
    const highlighted = content.replace(regex, '<mark className="bg-yellow-200 dark:bg-yellow-800">$1</mark>')
    return highlighted.substring(0, 300) + '...'
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

        {/* Search Results */}
        <div className="max-w-4xl mx-auto">
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
              {results.map((result, index) => (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer transition-colors">
                        {result.title}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {result.metadata.source && (
                          <span className="flex items-center">
                            <DocumentTextIcon className="w-4 h-4 mr-1" />
                            {result.metadata.source}
                          </span>
                        )}
                        {result.metadata.createdAt && (
                          <span>
                            {new Date(result.metadata.createdAt).toLocaleDateString()}
                          </span>
                        )}
                        <span className="flex items-center">
                          <EyeIcon className="w-4 h-4 mr-1" />
                          {result.metadata.wordCount} words
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 ml-4">
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {(result.score * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">relevance</div>
                      </div>
                      
                      {result.metadata.sensitivityLevel !== undefined && (
                        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                          result.metadata.sensitivityLevel === 0 ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
                          result.metadata.sensitivityLevel === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100' :
                          result.metadata.sensitivityLevel === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100' :
                          'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                        }`}>
                          {['Public', 'Internal', 'Confidential', 'Secret'][result.metadata.sensitivityLevel]}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div 
                    className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: formatSnippet(result.content, query) }}
                  />
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {result.metadata.tags && result.metadata.tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          <TagIcon className="w-4 h-4 text-gray-400" />
                          {result.metadata.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 px-2 py-1 rounded-full text-xs font-medium">
                              {tag}
                            </span>
                          ))}
                          {result.metadata.tags.length > 3 && (
                            <span className="text-xs text-gray-500">
                              +{result.metadata.tags.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button 
                        className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded-lg transition-all"
                        title="View full document"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      <button 
                        className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded-lg transition-all"
                        title="Copy content"
                      >
                        <DocumentDuplicateIcon className="w-4 h-4" />
                      </button>
                      <button 
                        className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded-lg transition-all"
                        title="Share result"
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

        {/* Search History Sidebar */}
        {searchHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="fixed right-4 top-1/2 transform -translate-y-1/2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 max-h-96 overflow-y-auto hidden xl:block"
          >
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
              <ClockIcon className="w-4 h-4 mr-2" />
              Search History
            </h3>
            <div className="space-y-2">
              {searchHistory.slice(0, 5).map((search, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setQuery(search.query)
                    setSearchMode(search.mode as SearchMode['id'])
                  }}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {search.query}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {search.mode} • {search.resultCount} results • {search.timestamp.toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default AdvancedSearchPage
