'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  HomeIcon, 
  ChatBubbleLeftRightIcon, 
  MagnifyingGlassIcon, 
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
  SparklesIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useSearchApi } from '../../services/apiClient'
import GamificationWidget from '../gamification/GamificationWidget'
import UserProfileDropdown from '../UserProfileDropdown'
import JobStatusWidget from '../JobStatusWidget'
import PageRenderer from '../PageRenderer'

interface ModernLayoutProps {
  activeView: string
  onViewChange: (view: string) => void
  sidebarOpen: boolean
  onSidebarToggle: () => void
}

const navigation = [
  { name: 'Dashboard', href: 'dashboard', icon: HomeIcon, current: true },
  { name: 'Analytics', href: 'analytics', icon: ChartBarIcon, current: false },
  { name: 'Chat Assistant', href: 'chat', icon: ChatBubbleLeftRightIcon, current: false },
  { name: 'Notes Browser', href: 'notes-browser', icon: FolderIcon, current: false },
  { name: 'Search', href: 'search', icon: MagnifyingGlassIcon, current: false },
  { name: 'Documents', href: 'documents', icon: DocumentTextIcon, current: false },
  { name: 'Knowledge Graph', href: 'graph', icon: ShareIcon, current: false },
  { name: 'Ingest', href: 'ingest', icon: DocumentTextIcon, current: false },
  { name: 'Achievements', href: 'achievements', icon: TrophyIcon, current: false },
  { name: 'Settings', href: 'settings', icon: CogIcon, current: false },
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

  // Debounced search function with race protection and fallback modes
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || !isAuthenticated) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    setShowSearchResults(true)

  // Track the latest request to avoid out-of-order updates
  const reqId = ++searchRequestIdRef.current

    const tryMode = async (mode: string) => {
      try {
        const res = await searchApi.searchGet(query, 5, mode, 0.6)
        // normalized: res.hits | res.Hits
        const results = (res?.Hits || res?.hits || []) as any[]
        return results
      } catch {
        return [] as any[]
      }
    }

    try {
      let results = await tryMode('hybrid')
      if (results.length === 0) results = await tryMode('semantic')
      if (results.length === 0) results = await tryMode('keyword')

      // Only update if this is the latest request
  if (searchRequestIdRef.current === reqId) {
        setSearchResults(results)
      }
    } catch (error) {
      console.error('Global search failed:', error)
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
        className={`fixed inset-y-0 z-50 flex w-80 flex-col bg-white/80 dark:bg-slate-800/90 backdrop-blur-xl border-r border-gray-200/50 dark:border-slate-700/50 shadow-xl lg:translate-x-0`}
      >
        {/* Sidebar header */}
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-gray-200/50 dark:border-slate-700/50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
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
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navigation.map((item) => (
            <motion.button
              key={item.name}
              onClick={() => onViewChange(item.href)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                activeView === item.href
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25'
                  : 'text-gray-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700/70 hover:text-gray-900 dark:hover:text-slate-100 hover:shadow-sm'
              }`}
            >
              <item.icon 
                className={`h-5 w-5 ${
                  activeView === item.href ? 'text-white' : 'text-gray-400 dark:text-slate-400'
                }`} 
              />
              <span>{item.name}</span>
            </motion.button>
          ))}
        </nav>

        {/* Gamification Widget */}
        {isAuthenticated && (
          <div className="px-4 pb-4">
            <GamificationWidget />
          </div>
        )}

        {/* User profile */}
        <div className="p-4 border-t border-gray-200/50 dark:border-slate-700/50">
          <UserProfileDropdown onNavigate={onViewChange} />
        </div>
      </motion.div>

  {/* Main content */}
  <div className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-80' : 'lg:ml-0'} flex flex-col h-screen`}>
        {/* Top bar */}
        <motion.header 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 px-6 shadow-sm dark:shadow-slate-900/20"
        >
          <div className="flex items-center space-x-4">
            <button
              onClick={onSidebarToggle}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors lg:hidden"
              title="Open sidebar"
            >
              <Bars3Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </button>
            
            <div className="hidden lg:block">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100 capitalize">
                {activeView.replace('-', ' ')}
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Background job status */}
            <JobStatusWidget />

            {/* Enhanced Global Search bar */}
            <div className="hidden md:block relative">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  placeholder="Search everything... (Ctrl+K)"
                  className="w-64 pl-10 pr-4 py-2 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-slate-900 dark:text-slate-100"
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
                className={`absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-lg z-50 max-h-96 overflow-y-auto transition-all duration-150 ${
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
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <SunIcon className="h-5 w-5 text-yellow-500" />
              ) : (
                <MoonIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              )}
            </motion.button>

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
              <PageRenderer activeView={activeView} />
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  )
}
