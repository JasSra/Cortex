'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  HomeIcon, 
  ChatBubbleLeftRightIcon, 
  MagnifyingGlassIcon, 
  MicrophoneIcon,
  DocumentTextIcon,
  ShareIcon,
  CogIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon,
  UserCircleIcon,
  ChartBarIcon,
  SunIcon,
  MoonIcon,
  TrophyIcon,
  FolderIcon,
  SparklesIcon,
  MapPinIcon,
  ServerIcon,
  Cog6ToothIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useSearchApi } from '../../services/apiClient'
import GamificationWidget from '../gamification/GamificationWidget'
import UserProfileDropdown from '../UserProfileDropdown'
import JobStatusWidget from '../JobStatusWidget'
import ConnectivityIndicator from '../ConnectivityIndicator'
import PageRenderer from '../PageRenderer'

interface ModernLayoutProps {
  activeView: string
  onViewChange: (view: string) => void
  sidebarOpen: boolean
  onSidebarToggle: () => void
}

// Navigation organized by relevance and logical grouping
const coreNavigation = [
  { name: 'Workspace', href: 'workspace', icon: Cog6ToothIcon, current: false },
  { name: 'Workflow', href: 'workflow', icon: MicrophoneIcon, current: false },
  { name: 'Search', href: 'search', icon: MagnifyingGlassIcon, current: true },
  { name: 'Chat Assistant', href: 'chat', icon: ChatBubbleLeftRightIcon, current: false },
  { name: 'Dashboard', href: 'dashboard', icon: HomeIcon, current: false },
]

const contentManagement = [
  { name: 'Documents', href: 'documents', icon: DocumentTextIcon, current: false },
  { name: 'Notes Browser', href: 'notes-browser', icon: FolderIcon, current: false },
  { name: 'Knowledge Graph', href: 'graph', icon: ShareIcon, current: false },
  { name: 'Ingest', href: 'ingest', icon: DocumentTextIcon, current: false },
]

const analyticsAndGamification = [
  { name: 'Analytics', href: 'analytics', icon: ChartBarIcon, current: false },
  { name: 'Achievements', href: 'achievements', icon: TrophyIcon, current: false },
]

const systemAndAdmin = [
  { name: 'System Status', href: 'system', icon: ServerIcon, current: false },
  { name: 'Jobs', href: 'jobs', icon: ChartBarIcon, current: false },
  { name: 'Configuration', href: 'config', icon: Cog6ToothIcon, current: false },
  { name: 'Settings', href: 'settings', icon: CogIcon, current: false },
]

// All navigation items in order of priority
const navigation = [
  ...coreNavigation,
  ...contentManagement,
  ...analyticsAndGamification,
  ...systemAndAdmin,
]

export default function ModernLayout({ 
  activeView, 
  onViewChange, 
  sidebarOpen, 
  onSidebarToggle 
}: ModernLayoutProps) {
  const { user, isAuthenticated } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const searchApi = useSearchApi()
  
  // Global search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  // Control visibility based on focus/click-outside to reduce flicker
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchResultsRef = useRef<HTMLDivElement>(null)
  const searchRequestIdRef = useRef<number>(0)
  const [sidebarPinned, setSidebarPinned] = useState<boolean>(false)
  
  // Collapsible section state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    content: false,
    analytics: false,
    system: true, // Start collapsed for less important sections
  })
  
  const isTest = process.env.NEXT_PUBLIC_TEST === '1' || process.env.NEXT_PUBLIC_TEST === 'true'

  // Toggle section collapse
  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }))
  }

  // Load persisted pin state and ensure sidebar opens if pinned
  useEffect(() => {
    try {
      const pin = localStorage.getItem('cortex:sidebar:pinned') === '1'
      setSidebarPinned(pin)
      if (pin && !sidebarOpen) onSidebarToggle()
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try { localStorage.setItem('cortex:sidebar:pinned', sidebarPinned ? '1' : '0') } catch {}
  }, [sidebarPinned])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      
      // Ctrl/Cmd + / to focus search (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      
      // Escape to clear search and blur
      if (e.key === 'Escape') {
        if (searchInputRef.current === document.activeElement) {
          searchInputRef.current?.blur()
          setHasFocus(false)
          setShowSearchResults(false)
          setSearchQuery('')
          setSearchResults([])
        }
      }
      
      // Enter to go to search page with current query
      if (e.key === 'Enter' && searchInputRef.current === document.activeElement && searchQuery.trim()) {
        e.preventDefault()
        onViewChange('search')
        setShowSearchResults(false)
        // Pass search query to search page (we'll enhance this)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('globalSearchQuery', searchQuery)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [searchQuery, onViewChange])

  // Click outside to close search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchResultsRef.current &&
        !searchResultsRef.current.contains(event.target as Node) &&
        !searchInputRef.current?.contains(event.target as Node)
      ) {
        setHasFocus(false)
        setShowSearchResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Enhanced search function using advanced search with better scoring and features
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || !isAuthenticated) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    setShowSearchResults(true)

    // Track the latest request to avoid out-of-order updates
    const reqId = ++searchRequestIdRef.current

    const tryAdvancedSearch = async (mode: string) => {
      try {
        const res = await searchApi.advancedSearch({
          Q: query,
          K: 5, // Limit to 5 results for the dropdown
          Mode: mode,
          Alpha: 0.6,
          UseReranking: true // Enable reranking for better results
        })
        // Use the enhanced search response format
        const results = (res?.Hits || res?.hits || []) as any[]
        return results
      } catch {
        return [] as any[]
      }
    }

    try {
      // First try hybrid search (best overall results)
      let results = await tryAdvancedSearch('hybrid')
      
      // If no results, try semantic search
      if (results.length === 0) {
        results = await tryAdvancedSearch('semantic')
      }
      
      // If still no results, try BM25 keyword search
      if (results.length === 0) {
        results = await tryAdvancedSearch('bm25')
      }

      // Only update if this is the latest request
      if (searchRequestIdRef.current === reqId) {
        setSearchResults(results)
      }
    } catch (error) {
      console.error('Enhanced global search failed:', error)
      // Fallback to basic search if advanced search fails
      try {
        const res = await searchApi.searchGet(query, 5, 'hybrid', 0.6)
        const results = (res?.Hits || res?.hits || []) as any[]
        if (searchRequestIdRef.current === reqId) {
          setSearchResults(results)
        }
      } catch (fallbackError) {
        console.error('Fallback search also failed:', fallbackError)
      }
    } finally {
      if (searchRequestIdRef.current === reqId) setIsSearching(false)
    }
  }, [searchApi, isAuthenticated])

  // Debounce search input
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        performSearch(searchQuery)
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(debounceTimer)
  }, [searchQuery, performSearch])

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setSearchQuery(e.target.value)
  }

  const handleSearchResultClick = (result: any) => {
    setShowSearchResults(false)
    setSearchQuery('')
    // Navigate to the note or result
    if (result.NoteId || result.noteId) {
      onViewChange('notes-browser')
      // Store the selected note ID for the notes browser to highlight
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('selectedNoteId', result.NoteId || result.noteId)
      }
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-gray-900/80 lg:hidden"
          onClick={onSidebarToggle}
        />
      )}

      {/* Sidebar */}
      <motion.div
        initial={{ x: sidebarOpen ? 0 : -320 }}
        animate={{ x: sidebarOpen ? 0 : -320 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 z-50 flex w-80 flex-col bg-white/80 dark:bg-slate-800/90 border-r border-gray-200/50 dark:border-slate-700/50 backdrop-blur-xl shadow-xl"
      >
        {/* Sidebar header */}
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-gray-200/50 dark:border-slate-700/50"
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-600">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Cortex
            </span>
          </div>
          <button
            onClick={onSidebarToggle}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            title="Close sidebar"
          >
            <XMarkIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-3">
          {/* Core Features - Always visible */}
          <div className="space-y-1">
            {coreNavigation.map((item) => (
              <motion.button
                key={item.name}
                onClick={() => onViewChange(item.href)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                data-testid={`nav-${item.href}`}
                className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                  activeView === item.href
                    ? false
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'
                      : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25'
                    : false
                      ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      : 'text-gray-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700/70 hover:text-gray-900 dark:hover:text-slate-100 hover:shadow-sm'
                }`}
              >
                <item.icon 
                  className={`h-5 w-5 ${
                    activeView === item.href 
                      ? false 
                        ? 'text-slate-700 dark:text-slate-200' 
                        : 'text-white' 
                      : false 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-gray-400 dark:text-slate-400'
                  }`} 
                />
                <span>{item.name}</span>
              </motion.button>
            ))}
          </div>

          {/* Content Management */}
          <div className="space-y-1">
            <button
              onClick={() => toggleSection('content')}
              className="w-full flex items-center justify-between px-2 py-2 text-xs font-semibold text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 transition-colors"
            >
              <span>CONTENT MANAGEMENT</span>
              {collapsedSections.content ? (
                <ChevronRightIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )}
            </button>
            <AnimatePresence>
              {!collapsedSections.content && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden space-y-1"
                >
                  {contentManagement.map((item) => (
                    <motion.button
                      key={item.name}
                      onClick={() => onViewChange(item.href)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      data-testid={`nav-${item.href}`}
                      className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                        activeView === item.href
                          ? false
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'
                            : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25'
                          : false
                            ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                            : 'text-gray-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700/70 hover:text-gray-900 dark:hover:text-slate-100 hover:shadow-sm'
                      }`}
                    >
                      <item.icon 
                        className={`h-5 w-5 ${
                          activeView === item.href 
                            ? false 
                              ? 'text-slate-700 dark:text-slate-200' 
                              : 'text-white' 
                            : false 
                              ? 'text-blue-600 dark:text-blue-400' 
                              : 'text-gray-400 dark:text-slate-400'
                        }`} 
                      />
                      <span>{item.name}</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Analytics & Gamification */}
          <div className="space-y-1">
            <button
              onClick={() => toggleSection('analytics')}
              className="w-full flex items-center justify-between px-2 py-2 text-xs font-semibold text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 transition-colors"
            >
              <span>ANALYTICS & PROGRESS</span>
              {collapsedSections.analytics ? (
                <ChevronRightIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )}
            </button>
            <AnimatePresence>
              {!collapsedSections.analytics && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden space-y-1"
                >
                  {analyticsAndGamification.map((item) => (
                    <motion.button
                      key={item.name}
                      onClick={() => onViewChange(item.href)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      data-testid={`nav-${item.href}`}
                      className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                        activeView === item.href
                          ? false
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'
                            : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25'
                          : false
                            ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                            : 'text-gray-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700/70 hover:text-gray-900 dark:hover:text-slate-100 hover:shadow-sm'
                      }`}
                    >
                      <item.icon 
                        className={`h-5 w-5 ${
                          activeView === item.href 
                            ? false 
                              ? 'text-slate-700 dark:text-slate-200' 
                              : 'text-white' 
                            : false 
                              ? 'text-blue-600 dark:text-blue-400' 
                              : 'text-gray-400 dark:text-slate-400'
                        }`} 
                      />
                      <span>{item.name}</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* System & Admin */}
          <div className="space-y-1">
            <button
              onClick={() => toggleSection('system')}
              className="w-full flex items-center justify-between px-2 py-2 text-xs font-semibold text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 transition-colors"
            >
              <span>SYSTEM & ADMIN</span>
              {collapsedSections.system ? (
                <ChevronRightIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )}
            </button>
            <AnimatePresence>
              {!collapsedSections.system && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden space-y-1"
                >
                  {systemAndAdmin.map((item) => (
                    <motion.button
                      key={item.name}
                      onClick={() => onViewChange(item.href)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      data-testid={`nav-${item.href}`}
                      className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                        activeView === item.href
                          ? false
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'
                            : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25'
                          : false
                            ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                            : 'text-gray-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700/70 hover:text-gray-900 dark:hover:text-slate-100 hover:shadow-sm'
                      }`}
                    >
                      <item.icon 
                        className={`h-5 w-5 ${
                          activeView === item.href 
                            ? false 
                              ? 'text-slate-700 dark:text-slate-200' 
                              : 'text-white' 
                            : false 
                              ? 'text-blue-600 dark:text-blue-400' 
                              : 'text-gray-400 dark:text-slate-400'
                        }`} 
                      />
                      <span>{item.name}</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>

        {/* Gamification Widget */}
        {isAuthenticated && (
          <div className="px-4 pb-4">
            <GamificationWidget />
          </div>
        )}

        {/* User profile */}
        <div className={`p-4 ${
          false 
            ? 'border-gray-200 dark:border-slate-700 border-t' 
            : 'border-t border-gray-200/50 dark:border-slate-700/50'
        }`}>
          <UserProfileDropdown onNavigate={onViewChange} />
        </div>
      </motion.div>

  {/* Main content */}
  <div className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-80' : 'lg:ml-0'} flex flex-col h-screen`}>
        {/* Top bar */}
        <motion.header 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between ${
            false 
              ? 'bg-white/90 dark:bg-slate-800/90 border-gray-200 dark:border-slate-700 border-b' 
              : 'bg-white/80 dark:bg-slate-900/80 border-b border-gray-200/50 dark:border-slate-700/50'
          } backdrop-blur-xl px-6 shadow-sm dark:shadow-slate-900/20`}
        >
          <div className="flex items-center space-x-4">
            <div className="flex items-center gap-2">
              <button
                onClick={onSidebarToggle}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                title={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
                data-testid="sidebar-toggle"
              >
                <Bars3Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </button>
              <button
                onClick={() => {
                  const next = !sidebarPinned
                  setSidebarPinned(next)
                  if (next && !sidebarOpen) onSidebarToggle()
                }}
                className={`p-2 rounded-lg transition-colors ${sidebarPinned ? 'bg-blue-50 dark:bg-slate-700' : 'hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                title={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
              >
                <MapPinIcon className={`h-5 w-5 ${sidebarPinned ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`} />
              </button>
            </div>
            
            <div className="hidden lg:block">
              <h1 className={`text-xl font-semibold capitalize ${
                false 
                  ? 'text-slate-700 dark:text-slate-200 ' 
                  : 'text-gray-900 dark:text-slate-100'
              }`}>
                {activeView.replace('-', ' ')}
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Background job status */}
            <JobStatusWidget />

            {/* Enhanced Global Search bar */}
            <div className={`${isTest ? 'block' : 'hidden md:block'} relative`}>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  placeholder="Search everything... (Ctrl+K)"
                  data-testid="global-search-input"
                  className={`w-64 pl-10 pr-4 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                    false
                      ? 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-blue-500 placeholder-gray-500'
                      : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-600 focus:ring-blue-500 focus:border-transparent text-slate-900 dark:text-slate-100'
                  }`}
                  onFocus={() => {
                    setHasFocus(true)
                    setShowSearchResults(true)
                    if (searchQuery.length >= 2) {
                      // Keep previous results visible during new search
                      performSearch(searchQuery)
                    }
                  }}
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  </div>
                )}
              </div>

              {/* Search Results Dropdown (always mounted to avoid flicker) */}
              <div
                ref={searchResultsRef}
                className={`absolute top-full left-0 right-0 mt-2 rounded-xl border shadow-lg z-50 max-h-96 overflow-y-auto transition-all duration-150 ${
                  false
                    ? 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
                    : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600'
                } ${
                  showSearchResults && hasFocus ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
                }`}
              >
                {searchResults.length > 0 ? (
                  <div className="p-2">
                    <div className="text-xs text-gray-500 dark:text-slate-400 px-3 py-2 border-b border-gray-100 dark:border-slate-700">
                      Search Results ({searchResults.length})
                    </div>
                    {searchResults.slice(0, 5).map((result, index) => (
                      <button
                        key={index}
                        onClick={() => handleSearchResultClick(result)}
                        className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <div className="font-medium text-gray-900 dark:text-slate-100 text-sm truncate">
                          {result.Title || result.title || 'Untitled'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {result.Content || result.content || result.Snippet || 'No preview available'}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-blue-500 dark:text-blue-400">
                            Score: {(((result.Score ?? result.score) || 0) * 100).toFixed(0)}%
                          </span>
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            {result.NoteId || result.noteId || 'Unknown'}
                          </span>
                        </div>
                      </button>
                    ))}
                    <div className="border-t border-gray-100 dark:border-slate-700 mt-2 pt-2">
                      <button
                        onClick={() => {
                          onViewChange('search')
                          setHasFocus(false)
                          setShowSearchResults(false)
                          if (typeof window !== 'undefined') {
                            window.localStorage.setItem('globalSearchQuery', searchQuery)
                          }
                        }}
                        className="w-full text-center py-2 text-sm text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        View all results for &ldquo;{searchQuery}&rdquo; →
                      </button>
                    </div>
                  </div>
                ) : searchQuery.length >= 2 && !isSearching ? (
                  <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm">
                    No results found for &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : searchQuery.length < 2 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm">
                    Type at least 2 characters to search
                  </div>
                ) : null}
              </div>
            </div>

            {/* Dark Mode Toggle */}
            <motion.button
              onClick={toggleTheme}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`p-2 rounded-xl transition-colors ${
                false
                  ? 'hover:bg-gray-100 dark:hover:bg-slate-700 border-gray-200 dark:border-slate-700'
                  : 'hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
              title={`Switch to ${theme === 'dark' ? 'light' : theme === 'auto' ? (theme === 'auto' ? 'light' : 'auto') : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <SunIcon className="h-5 w-5 text-yellow-500" />
              ) : false ? (
                <div className="w-5 h-5 bg-gradient-to-br from-cyan-400 to-orange-500 rounded animate-pulse" />
              ) : (
                <MoonIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              )}
            </motion.button>

            {/* Connectivity Status */}
            <ConnectivityIndicator size="sm" />

            {/* Notifications */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              title="Notifications"
            >
              <BellIcon className="h-5 w-5 text-gray-600 dark:text-slate-400" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
            </motion.button>

            {/* Profile */}
            <UserProfileDropdown onNavigate={onViewChange} />
          </div>
        </motion.header>

        {/* Page content (scrollable) */}
        <div className="flex-1 overflow-y-auto">
          <main className="p-6">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Make an escape hatch so WelcomePage can navigate */}
              <PageRenderer activeView={activeView} onViewChange={onViewChange} />
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  )
}
