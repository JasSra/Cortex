'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  MicrophoneIcon,
  AdjustmentsHorizontalIcon,
  SparklesIcon,
  DocumentTextIcon,
  ClockIcon,
  TagIcon,
  FunnelIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { useMascot } from '@/contexts/MascotContext'
import { useSearchApi, useTagsApi } from '@/services/apiClient'

interface SearchResult {
  noteId: string
  chunkId: string
  title: string
  snippet: string
  content: string
  highlight: string
  offsets: number[]
  snippetStart: number
  chunkIndex: number
  score: number
  createdAt: string
  source: string
  fileType: string
  sensitivityLevel: number
  tags: string[]
  hasPii: boolean
  hasSecrets: boolean
  piiTypes: string[]
  secretTypes: string[]
}

interface SearchChunk {
  id: string
  content: string
  score: number
  startIndex: number
  endIndex: number
}

interface SearchFilters {
  sensitivityLevels: number[]
  tags: string[]
  fromDate?: string
  toDate?: string
  fileTypes: string[]
  sources: string[]
}

const SearchEverythingPage: React.FC = () => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchStats, setSearchStats] = useState({ total: 0, executionTime: 0 })
  const [showFilters, setShowFilters] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [filters, setFilters] = useState<SearchFilters>({
    sensitivityLevels: [],
    tags: [],
    fileTypes: [],
    sources: []
  })
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  
  const { speak, listen, think, idle, suggest } = useMascot()
  const { searchGet } = useSearchApi()
  const { getAllTags, searchNotesByTags } = useTagsApi()

  // Load available tags
  useEffect(() => {
    const loadTags = async () => {
      try {
        const tags = await getAllTags()
        setAvailableTags(tags.map(t => t.name).filter((name): name is string => !!name))
      } catch (error) {
        console.error('Failed to load tags:', error)
      }
    }
    loadTags()
  }, [getAllTags])

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('cortex-recent-searches')
    if (saved) {
      setRecentSearches(JSON.parse(saved))
    }
  }, [])

  // Voice recognition setup
  const startVoiceSearch = useCallback(async () => {
    if (!('webkitSpeechRecognition' in window)) {
      speak("Sorry, voice search is not supported in your browser", 'error')
      return
    }

    setIsListening(true)
    listen()

    const recognition = new (window as any).webkitSpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      speak("I'm listening for your search query...")
    }

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setQuery(transcript)
      performSearch(transcript)
      speak(`Searching for: ${transcript}`, 'thinking')
    }

    recognition.onerror = () => {
      speak("Sorry, I couldn't hear you clearly. Try again!", 'error')
      setIsListening(false)
      idle()
    }

    recognition.onend = () => {
      setIsListening(false)
      idle()
    }

    recognition.start()
  }, [speak, listen, idle])

  // Perform search with filters
  const performSearch = useCallback(async (searchQuery: string = query) => {
    if (!searchQuery.trim() && filters.tags.length === 0) {
      suggest("Try entering a search term or selecting some tags!")
      return
    }

    setIsSearching(true)
    think()

    try {
      const startTime = Date.now()
      let response: any

      // If we have tags, use tag-based search
      if (filters.tags.length > 0) {
        const tagSearchResult = await searchNotesByTags(filters.tags, {
          mode: 'all', // You could make this configurable
          limit: 20,
          offset: 0
        })
        
        // Convert NoteMeta to SearchResult format
        const hits = tagSearchResult.items.map(item => ({
          noteId: item.id,
          chunkId: '', // Tag search doesn't have chunks
          title: item.title,
          snippet: '', // NoteMeta doesn't include content
          content: '', // NoteMeta doesn't include content
          highlight: '',
          offsets: [],
          snippetStart: 0,
          chunkIndex: 0,
          score: 1.0, // Tag matches are considered high confidence
          createdAt: item.createdAt,
          source: item.fileType || '',
          fileType: item.fileType || '',
          sensitivityLevel: item.sensitivityLevel || 0,
          tags: item.tags || [],
          hasPii: false,
          hasSecrets: false,
          piiTypes: [],
          secretTypes: []
        }))
        
        response = {
          hits,
          total: tagSearchResult.total,
          executionTime: Date.now() - startTime
        }
      } else {
        // Regular text search - properly handle SearchResponse format
        const searchResponse = await searchGet(searchQuery, 20, 'hybrid', 0.6)
        response = {
          hits: searchResponse.hits || searchResponse.Hits || [], // Handle both casing
          total: searchResponse.total || searchResponse.Total || 0,
          executionTime: Date.now() - startTime
        }
      }
      
      const executionTime = Date.now() - startTime

      setResults(response.hits || [])
      setSearchStats({
        total: response.total || 0,
        executionTime
      })

      // Save to recent searches (only for text queries)
      if (searchQuery.trim()) {
        const newRecentSearches = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5)
        setRecentSearches(newRecentSearches)
        localStorage.setItem('cortex-recent-searches', JSON.stringify(newRecentSearches))
      }

      // Mascot feedback
      if (response.hits?.length > 0) {
        const searchType = filters.tags.length > 0 ? 'tag-filtered' : 'text'
        speak(`Found ${response.hits.length} ${searchType} results in ${executionTime}ms!`, 'responding')
      } else {
        speak("No results found. Try different keywords or check your filters.", 'suggesting')
      }

    } catch (error) {
      console.error('Search error:', error)
      speak("Oops! There was an error with your search. Please try again.", 'error')
    } finally {
      setIsSearching(false)
      idle()
    }
  }, [query, filters, searchGet, searchNotesByTags, speak, think, idle, suggest, recentSearches])

  // Handle search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    performSearch()
  }

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      sensitivityLevels: [],
      tags: [],
      fileTypes: [],
      sources: []
    })
    speak("Filters cleared! Your search is now unrestricted.", 'idle')
  }

  // Format result snippet with highlighting - now uses the backend highlighting
  const formatSnippet = (result: SearchResult, query: string) => {
    // Use backend-generated highlight if available, otherwise fallback to snippet
    const contentToShow = result.highlight || result.snippet || result.content.substring(0, 300)
    
    if (!contentToShow) return 'No preview available'
    
    // If the backend provided highlighting (contains <mark> tags), render as HTML
    if (contentToShow.includes('<mark>')) {
      return <span dangerouslySetInnerHTML={{ __html: contentToShow }} />
    }
    
    // Fallback: manual highlighting for cases where backend didn't provide it
    if (!query) return contentToShow + (contentToShow.length >= 300 ? '...' : '')
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return contentToShow.split(regex).map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800">{part}</mark>
      ) : part
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.h1 
            className="text-4xl font-bold text-gray-900 dark:text-white mb-2"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Search Everything
          </motion.h1>
          <motion.p 
            className="text-lg text-gray-600 dark:text-gray-400"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Discover insights across your entire knowledge base
          </motion.p>
        </div>

        {/* Search Form */}
        <motion.div 
          className="mb-8"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <form onSubmit={handleSearch} className="relative max-w-4xl mx-auto">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask anything... or use voice search"
                className="w-full pl-12 pr-24 py-4 text-lg border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-lg"
              />
              
              {/* Voice Search Button */}
              <motion.button
                type="button"
                onClick={startVoiceSearch}
                disabled={isListening}
                className={`absolute right-16 top-1/2 transform -translate-y-1/2 p-2 rounded-lg ${
                  isListening 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'bg-purple-500 hover:bg-purple-600 text-white'
                } transition-colors`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <MicrophoneIcon className="w-5 h-5" />
              </motion.button>

              {/* Filters Toggle */}
              <motion.button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <AdjustmentsHorizontalIcon className="w-5 h-5" />
              </motion.button>
            </div>
          </form>

          {/* Quick Actions for Tag Search */}
          {filters.tags.length > 0 && (
            <motion.div 
              className="max-w-4xl mx-auto mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex gap-2 items-center">
                <motion.button
                  type="button"
                  onClick={() => performSearch('')}
                  className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <TagIcon className="w-4 h-4" />
                  Search by Tags Only
                </motion.button>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {filters.tags.length} tag{filters.tags.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            </motion.div>
          )}

          {/* Recent Searches */}
          {recentSearches.length > 0 && !query && (
            <motion.div 
              className="max-w-4xl mx-auto mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Recent searches:</p>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((search, index) => (
                  <motion.button
                    key={index}
                    onClick={() => {
                      setQuery(search)
                      performSearch(search)
                    }}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-purple-100 dark:hover:bg-purple-800 transition-colors"
                    whileHover={{ scale: 1.05 }}
                  >
                    {search}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Advanced Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Advanced Filters</h3>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                  >
                    Clear All
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Sensitivity Levels */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                            className="mr-2"
                          />
                          <span className={`text-sm text-${level.color}-600 dark:text-${level.color}-400`}>
                            {level.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Date Range
                    </label>
                    <div className="space-y-2">
                      <input
                        type="date"
                        value={filters.fromDate || ''}
                        onChange={(e) => setFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder="From date"
                      />
                      <input
                        type="date"
                        value={filters.toDate || ''}
                        onChange={(e) => setFilters(prev => ({ ...prev, toDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder="To date"
                      />
                    </div>
                  </div>

                  {/* File Types */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      File Types
                    </label>
                    <div className="space-y-2">
                      {['pdf', 'docx', 'txt', 'md', 'html'].map(type => (
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
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300 uppercase">
                            {type}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tags
                    </label>
                    <div className="space-y-2">
                      {/* Selected Tags */}
                      {filters.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {filters.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center gap-1 bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 px-2 py-1 rounded text-xs"
                            >
                              {tag}
                              <button
                                type="button"
                                title={`Remove ${tag} tag`}
                                onClick={() => setFilters(prev => ({
                                  ...prev,
                                  tags: prev.tags.filter((_, i) => i !== index)
                                }))}
                                className="hover:bg-purple-200 dark:hover:bg-purple-700 rounded"
                              >
                                <XMarkIcon className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Tag Input with Autocomplete */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Type to search tags..."
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const value = e.currentTarget.value.trim()
                              if (value && !filters.tags.includes(value)) {
                                setFilters(prev => ({
                                  ...prev,
                                  tags: [...prev.tags, value]
                                }))
                                e.currentTarget.value = ''
                              }
                            }
                          }}
                        />
                        
                        {/* Autocomplete Dropdown */}
                        {availableTags.length > 0 && (
                          <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md mt-1 max-h-40 overflow-y-auto z-10 shadow-lg">
                            {availableTags
                              .filter(tag => !filters.tags.includes(tag))
                              .slice(0, 10)
                              .map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => {
                                    setFilters(prev => ({
                                      ...prev,
                                      tags: [...prev.tags, tag]
                                    }))
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-white"
                                >
                                  {tag}
                                </button>
                              ))
                            }
                          </div>
                        )}
                      </div>
                      
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Press Enter to add a tag, or click from suggestions above
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search Stats */}
        {searchStats.total > 0 && (
          <motion.div 
            className="max-w-4xl mx-auto mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span>
                <strong>{searchStats.total.toLocaleString()}</strong> results
              </span>
              <span>•</span>
              <span>
                <ClockIcon className="w-4 h-4 inline mr-1" />
                {searchStats.executionTime}ms
              </span>
              {Object.values(filters).some(f => Array.isArray(f) ? f.length > 0 : !!f) && (
                <>
                  <span>•</span>
                  <span className="flex items-center">
                    <FunnelIcon className="w-4 h-4 mr-1" />
                    Filtered
                  </span>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Search Results */}
        <div className="max-w-4xl mx-auto">
          {isSearching ? (
            <div className="text-center py-12">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"
              />
              <p className="text-gray-600 dark:text-gray-400">Searching...</p>
            </div>
          ) : results.length > 0 ? (
            <motion.div 
              className="space-y-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {results.map((result, index) => (
                <motion.div
                  key={result.noteId || result.chunkId || index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer">
                      {result.title || 'Untitled'}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        Score: {(result.score * 100).toFixed(1)}%
                      </span>
                      {result.sensitivityLevel !== undefined && (
                        <span className={`text-xs px-2 py-1 rounded ${
                          result.sensitivityLevel === 0 ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200' :
                          result.sensitivityLevel === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' :
                          result.sensitivityLevel === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-200' :
                          'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200'
                        }`}>
                          {['Public', 'Internal', 'Confidential', 'Secret'][result.sensitivityLevel] || 'Unknown'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
                    {formatSnippet(result, query)}
                  </div>
                  
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-4">
                      {result.source && (
                        <span className="flex items-center">
                          <DocumentTextIcon className="w-4 h-4 mr-1" />
                          {result.source}
                        </span>
                      )}
                      {result.createdAt && (
                        <span>
                          {new Date(result.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    
                    {result.tags && result.tags.length > 0 && (
                      <div className="flex items-center gap-1">
                        <TagIcon className="w-4 h-4" />
                        {result.tags.slice(0, 3).map((tag: string) => (
                          <span key={tag} className="bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 px-2 py-1 rounded text-xs">
                            {tag}
                          </span>
                        ))}
                        {result.tags.length > 3 && (
                          <span className="text-xs text-gray-400">+{result.tags.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : query && !isSearching ? (
            <motion.div 
              className="text-center py-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <SparklesIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No results found
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Try different keywords, clear your filters, or check your spelling.
              </p>
              <button
                onClick={clearFilters}
                className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-medium"
              >
                Clear filters and try again
              </button>
            </motion.div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default SearchEverythingPage
