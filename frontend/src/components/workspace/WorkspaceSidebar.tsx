'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  DocumentTextIcon,
  TagIcon,
  ClockIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparklesIcon,
  LightBulbIcon,
  FireIcon,
  BeakerIcon,
  EyeIcon,
  HashtagIcon,
  StarIcon,
  BoltIcon
} from '@heroicons/react/24/outline'
import { useWorkspaceApi, useNotesApi, useTagsApi, useClassificationApi, useGraphApi } from '../../services/apiClient'

interface WorkspaceSidebarProps {
  isOpen: boolean
  onClose: () => void
  onNoteSelect: (noteId: string) => void
  selectedNoteId?: string
  onCreateNote?: () => void
}

interface Note {
  id: string
  title: string
  content?: string
  tags: string[]
  createdAt: string
  updatedAt: string
  lastAccessed?: string
}

interface SmartSuggestion {
  id: string
  type: 'note' | 'tag' | 'action' | 'insight'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  action?: () => void
  icon?: React.ReactNode
}

export default function WorkspaceSidebar({ 
  isOpen, 
  onClose, 
  onNoteSelect, 
  selectedNoteId,
  onCreateNote
}: WorkspaceSidebarProps) {
  const [allNotes, setAllNotes] = useState<Note[]>([])
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'recent' | 'suggestions'>('all')
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [autoTaggingEnabled, setAutoTaggingEnabled] = useState(true)
  const [tagGenerationProgress, setTagGenerationProgress] = useState<{ [noteId: string]: boolean }>({})

  const { getRecentNotes, trackNoteAccess } = useWorkspaceApi()
  const { getNotes } = useNotesApi()
  const { getAllTags } = useTagsApi()
  const { classifyNote } = useClassificationApi()
  const { getEntitySuggestions } = useGraphApi()

  // Filter notes based on search query
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) {
      return activeTab === 'all' ? allNotes : recentNotes
    }
    
    const query = searchQuery.toLowerCase()
    const notesToFilter = activeTab === 'all' ? allNotes : recentNotes
    
    return notesToFilter.filter(note => 
      note.title.toLowerCase().includes(query) ||
      note.tags.some(tag => tag.toLowerCase().includes(query)) ||
      (note.content && note.content.toLowerCase().includes(query))
    )
  }, [allNotes, recentNotes, searchQuery, activeTab])

  // Extract unique tags from all notes
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    allNotes.forEach(note => {
      note.tags.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [allNotes])

  // Auto-tagging functionality
  const autoTagNotes = useCallback(async (notes: Note[]) => {
    for (const note of notes) {
      try {
        setTagGenerationProgress(prev => ({ ...prev, [note.id]: true }))
        
        // Use classification service to generate tags
        const result = await classifyNote(note.id)
        
        if (result && result.tags) {
          // Update note with new tags (fix Set iteration issue)
          setAllNotes(prev => 
            prev.map(n => 
              n.id === note.id 
                ? { ...n, tags: Array.from(new Set([...n.tags, ...result.tags])) }
                : n
            )
          )
        }
      } catch (error) {
        console.error(`Failed to auto-tag note ${note.id}:`, error)
      } finally {
        setTagGenerationProgress(prev => ({ ...prev, [note.id]: false }))
      }
    }
  }, [classifyNote])

  // Smart suggestions generation
  const generateSmartSuggestions = useCallback(async () => {
    if (suggestionsLoading) return
    
    setSuggestionsLoading(true)
    try {
      const suggestions: SmartSuggestion[] = []
      
      // Get recent activity patterns
      const recentActivity = recentNotes.slice(0, 5)
      
      // Generate content-based suggestions
      if (recentActivity.length > 0) {
        suggestions.push({
          id: 'continue-recent',
          type: 'action',
          title: 'Continue Recent Work',
          description: `Resume editing "${recentActivity[0].title}"`,
          priority: 'high',
          action: () => onNoteSelect(recentActivity[0].id),
          icon: <ClockIcon className="w-4 h-4" />
        })
      }
      
      // Tag suggestions based on content analysis
      const untaggedNotes = allNotes.filter(note => note.tags.length === 0)
      if (untaggedNotes.length > 0) {
        suggestions.push({
          id: 'auto-tag',
          type: 'action',
          title: 'Auto-Tag Notes',
          description: `${untaggedNotes.length} notes could benefit from tags`,
          priority: 'medium',
          action: () => autoTagNotes(untaggedNotes),
          icon: <HashtagIcon className="w-4 h-4" />
        })
      }
      
      // Knowledge graph suggestions
      try {
        const entitySuggestions = await getEntitySuggestions('')
        if (entitySuggestions && entitySuggestions.length > 0) {
          suggestions.push({
            id: 'explore-connections',
            type: 'insight',
            title: 'Explore Connections',
            description: `Found ${entitySuggestions.length} related concepts`,
            priority: 'medium',
            icon: <BeakerIcon className="w-4 h-4" />
          })
        }
      } catch (e) {
        console.log('Entity suggestions not available')
      }
      
      // Create new note suggestion
      suggestions.push({
        id: 'create-note',
        type: 'action',
        title: 'Create New Note',
        description: 'Start capturing new ideas',
        priority: 'low',
        action: onCreateNote,
        icon: <PlusIcon className="w-4 h-4" />
      })
      
      // Search suggestions based on patterns
      if (searchQuery.length > 2) {
        suggestions.push({
          id: 'search-insight',
          type: 'insight',
          title: 'Smart Search',
          description: `Searching for "${searchQuery}" - try related terms`,
          priority: 'medium',
          icon: <LightBulbIcon className="w-4 h-4" />
        })
      }
      
      setSmartSuggestions(suggestions)
    } catch (error) {
      console.error('Failed to generate suggestions:', error)
    } finally {
      setSuggestionsLoading(false)
    }
  }, [allNotes, recentNotes, searchQuery, onNoteSelect, onCreateNote, getEntitySuggestions, suggestionsLoading, autoTagNotes])

  // Generate smart tags for a specific note when selected
  const generateTagsForNote = useCallback(async (noteId: string) => {
    if (!autoTaggingEnabled || tagGenerationProgress[noteId]) return
    
    const note = allNotes.find(n => n.id === noteId)
    if (!note || note.tags.length > 0) return
    
    try {
      setTagGenerationProgress(prev => ({ ...prev, [noteId]: true }))
      
      const result = await classifyNote(note.id)
      
      if (result && result.tags && result.tags.length > 0) {
        // Show tag suggestions to user
        setSmartSuggestions(prev => [{
          id: `tag-suggestion-${noteId}`,
          type: 'tag',
          title: 'Suggested Tags',
          description: `Add tags: ${result.tags.join(', ')}`,
          priority: 'high',
          action: () => {
            setAllNotes(prev => 
              prev.map(n => 
                n.id === noteId 
                  ? { ...n, tags: Array.from(new Set([...n.tags, ...result.tags])) }
                  : n
              )
            )
            // Remove suggestion after applying
            setSmartSuggestions(prev => prev.filter(s => s.id !== `tag-suggestion-${noteId}`))
          },
          icon: <StarIcon className="w-4 h-4" />
        }, ...prev.filter(s => !s.id.startsWith('tag-suggestion-'))])
      }
    } catch (error) {
      console.error('Failed to generate tags:', error)
    } finally {
      setTagGenerationProgress(prev => ({ ...prev, [noteId]: false }))
    }
  }, [autoTaggingEnabled, tagGenerationProgress, allNotes, classifyNote])

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Load all notes
      const notesResponse = await getNotes(1, 100) // Get up to 100 notes
      console.log('Notes response:', notesResponse)
      
      // Transform the API response to our Note interface
      const notes: Note[] = (notesResponse || []).map((note: any) => ({
        id: note.id || note.noteId || note.NoteId,
        title: note.title || note.Title || 'Untitled Note',
        content: note.content || note.Content || '',
        tags: note.tags || note.Tags || [],
        createdAt: note.createdAt || note.CreatedAt || new Date().toISOString(),
        updatedAt: note.updatedAt || note.UpdatedAt || new Date().toISOString(),
      }))
      
      setAllNotes(notes)
      
      // Load recent notes
      try {
        const recentResponse = await getRecentNotes(10)
        console.log('Recent notes response:', recentResponse)
        
        // Transform recent notes and match with full notes data
        const recentNotesData = (recentResponse || []).map((recentNote: any) => {
          const fullNote = notes.find(n => n.id === recentNote.id)
          return fullNote || {
            id: recentNote.id,
            title: recentNote.title || 'Untitled Note',
            content: '',
            tags: recentNote.tags || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastAccessed: recentNote.lastAccessed
          }
        })
        
        setRecentNotes(recentNotesData)
      } catch (recentError) {
        console.warn('Failed to load recent notes:', recentError)
        // Recent notes failing shouldn't prevent the sidebar from working
      }
      
    } catch (err: any) {
      console.error('Failed to load notes:', err)
      setError(err?.message || 'Failed to load notes')
    } finally {
      setLoading(false)
    }
  }, [getNotes, getRecentNotes])

  useEffect(() => {
    if (isOpen) {
      loadNotes()
    }
  }, [isOpen, loadNotes])

  // Generate smart suggestions when data changes
  useEffect(() => {
    if (isOpen && allNotes.length > 0) {
      const timeoutId = setTimeout(() => {
        generateSmartSuggestions()
      }, 1000) // Debounce suggestions generation
      
      return () => clearTimeout(timeoutId)
    }
  }, [isOpen, allNotes, recentNotes, searchQuery, generateSmartSuggestions])

  // Auto-generate tags for new notes when selected
  useEffect(() => {
    if (selectedNoteId && autoTaggingEnabled) {
      generateTagsForNote(selectedNoteId)
    }
  }, [selectedNoteId, autoTaggingEnabled, generateTagsForNote])

  const handleNoteClick = useCallback(async (noteId: string) => {
    try {
      await trackNoteAccess(noteId, 'opened', 0, {})
      onNoteSelect(noteId)
    } catch (error) {
      console.error('Failed to track note access:', error)
      // Still select the note even if tracking fails
      onNoteSelect(noteId)
    }
  }, [trackNoteAccess, onNoteSelect])

  const formatLastAccessed = useCallback((timestamp?: string) => {
    if (!timestamp) return 'Never'
    
    try {
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / (1000 * 60))
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      if (diffDays < 7) return `${diffDays}d ago`
      return date.toLocaleDateString()
    } catch {
      return 'Unknown'
    }
  }, [])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed left-0 top-16 bottom-0 w-80 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 shadow-xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Workspace
              </h2>
              <button
                onClick={onClose}
                aria-label="Close workspace sidebar"
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500 dark:text-slate-400" />
              </button>
            </div>

            {/* Enhanced Search with AI indicator */}
            <div className="p-4 border-b border-gray-200 dark:border-slate-700">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search notes... (AI-powered)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                {searchQuery.length > 2 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    <SparklesIcon className="w-4 h-4 text-purple-500 animate-pulse" />
                  </motion.div>
                )}
              </div>
              
              {/* Auto-tagging toggle */}
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={autoTaggingEnabled}
                    onChange={(e) => setAutoTaggingEnabled(e.target.checked)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  Auto-generate tags
                </label>
                {Object.values(tagGenerationProgress).some(Boolean) && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-3 h-3 border border-purple-500 border-t-transparent rounded-full"
                  />
                )}
              </div>
            </div>

            {/* Enhanced Tab Navigation with AI */}
            <div className="flex border-b border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setActiveTab('all')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400 bg-purple-50 dark:bg-purple-900/20'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <DocumentTextIcon className="w-3 h-3" />
                  All ({allNotes.length})
                </div>
              </button>
              <button
                onClick={() => setActiveTab('recent')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === 'recent'
                    ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400 bg-purple-50 dark:bg-purple-900/20'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <ClockIcon className="w-3 h-3" />
                  Recent ({recentNotes.length})
                </div>
              </button>
              <button
                onClick={() => setActiveTab('suggestions')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
                  activeTab === 'suggestions'
                    ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400 bg-purple-50 dark:bg-purple-900/20'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <BoltIcon className="w-3 h-3" />
                  AI ({smartSuggestions.length})
                  {smartSuggestions.some(s => s.priority === 'high') && (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"
                    />
                  )}
                </div>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                </div>
              ) : error ? (
                <div className="p-4 text-center">
                  <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                  <button
                    onClick={loadNotes}
                    className="mt-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="h-full overflow-y-auto">
                  {/* Create New Note Button */}
                  {onCreateNote && activeTab !== 'suggestions' && (
                    <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                      <button
                        onClick={onCreateNote}
                        className="w-full flex items-center gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-gray-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400"
                      >
                        <PlusIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">Create New Note</span>
                      </button>
                    </div>
                  )}

                  {/* Conditional Content Based on Active Tab */}
                  {activeTab === 'suggestions' ? (
                    /* AI Suggestions View */
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                          <BoltIcon className="w-4 h-4 text-purple-500" />
                          Smart Suggestions
                        </h3>
                        <button
                          onClick={generateSmartSuggestions}
                          disabled={suggestionsLoading}
                          title="Refresh suggestions"
                          className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                          <motion.div
                            animate={suggestionsLoading ? { rotate: 360 } : {}}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          >
                            <SparklesIcon className="w-4 h-4 text-purple-500" />
                          </motion.div>
                        </button>
                      </div>

                      {smartSuggestions.length === 0 ? (
                        <div className="text-center py-8">
                          <LightBulbIcon className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                          <p className="text-gray-500 dark:text-slate-400 text-sm">
                            {suggestionsLoading ? 'Generating smart suggestions...' : 'No suggestions available'}
                          </p>
                          {!suggestionsLoading && allNotes.length > 0 && (
                            <button
                              onClick={generateSmartSuggestions}
                              className="mt-2 text-purple-600 dark:text-purple-400 text-sm hover:underline"
                            >
                              Generate suggestions
                            </button>
                          )}
                        </div>
                      ) : (
                        <AnimatePresence mode="popLayout">
                          {smartSuggestions.map((suggestion) => (
                            <motion.div
                              key={suggestion.id}
                              layout
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -20 }}
                              transition={{ duration: 0.2 }}
                              className={`p-3 rounded-lg border transition-all cursor-pointer ${
                                suggestion.priority === 'high'
                                  ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                                  : suggestion.priority === 'medium'
                                  ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20'
                                  : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50'
                              } hover:shadow-sm`}
                              onClick={suggestion.action}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`p-1.5 rounded-md flex-shrink-0 ${
                                  suggestion.type === 'action'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : suggestion.type === 'tag'
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                    : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                }`}>
                                  {suggestion.icon || <LightBulbIcon className="w-3 h-3" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                      {suggestion.title}
                                    </p>
                                    {suggestion.priority === 'high' && (
                                      <motion.div
                                        animate={{ scale: [1, 1.1, 1] }}
                                        transition={{ duration: 1, repeat: Infinity }}
                                        className="w-2 h-2 bg-red-500 rounded-full"
                                      />
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">
                                    {suggestion.description}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      suggestion.type === 'action'
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                        : suggestion.type === 'tag'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                    }`}>
                                      {suggestion.type}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      suggestion.priority === 'high'
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                        : suggestion.priority === 'medium'
                                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                        : 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300'
                                    }`}>
                                      {suggestion.priority}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      )}
                    </div>
                  ) : (
                    /* Notes List View */
                    <div className="p-4 space-y-2">
                      {filteredNotes.length === 0 ? (
                        <div className="text-center py-8">
                          <DocumentTextIcon className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                          <p className="text-gray-500 dark:text-slate-400 text-sm">
                            {searchQuery ? 'No notes match your search' : 'No notes found'}
                          </p>
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="mt-2 text-purple-600 dark:text-purple-400 text-sm hover:underline"
                            >
                              Clear search
                            </button>
                          )}
                        </div>
                      ) : (
                        <AnimatePresence mode="popLayout">
                          {filteredNotes.map((note) => (
                            <motion.div
                              key={note.id}
                              layout
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -20 }}
                              transition={{ duration: 0.2 }}
                            >
                              <motion.button
                                onClick={() => handleNoteClick(note.id)}
                                className={`w-full text-left p-3 rounded-lg transition-all duration-200 group relative ${
                                  selectedNoteId === note.id
                                    ? 'bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 shadow-sm'
                                    : 'hover:bg-gray-50 dark:hover:bg-slate-800 border border-transparent hover:border-gray-200 dark:hover:border-slate-700'
                                }`}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                              >
                                {/* Auto-tagging progress indicator */}
                                {tagGenerationProgress[note.id] && (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute top-2 right-2"
                                  >
                                    <motion.div
                                      animate={{ rotate: 360 }}
                                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                      className="w-3 h-3 border border-purple-500 border-t-transparent rounded-full"
                                    />
                                  </motion.div>
                                )}
                                
                                <div className="flex items-start gap-3">
                                  <DocumentTextIcon className="w-4 h-4 text-gray-400 dark:text-slate-500 mt-1 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400">
                                      {note.title || 'Untitled Note'}
                                    </p>
                                    
                                    {/* Enhanced Tags with AI indicator */}
                                    {note.tags && note.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {note.tags.slice(0, 3).map((tag, index) => (
                                          <motion.span
                                            key={index}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700"
                                          >
                                            <HashtagIcon className="w-2.5 h-2.5 mr-1" />
                                            {tag}
                                          </motion.span>
                                        ))}
                                        {note.tags.length > 3 && (
                                          <span className="text-xs text-gray-500 dark:text-slate-400">
                                            +{note.tags.length - 3} more
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* No tags indicator for auto-tagging */}
                                    {(!note.tags || note.tags.length === 0) && autoTaggingEnabled && (
                                      <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex items-center gap-1 mt-1"
                                      >
                                        <SparklesIcon className="w-3 h-3 text-gray-400" />
                                        <span className="text-xs text-gray-500 dark:text-slate-400">
                                          Auto-tagging available
                                        </span>
                                      </motion.div>
                                    )}
                                    
                                    <div className="flex items-center gap-2 mt-1">
                                      <ClockIcon className="w-3 h-3 text-gray-400 dark:text-slate-500" />
                                      <p className="text-xs text-gray-500 dark:text-slate-400">
                                        {formatLastAccessed(note.lastAccessed || note.updatedAt)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </motion.button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      )}
                    </div>
                  )}

                  {/* Enhanced Tag Cloud */}
                  {activeTab !== 'suggestions' && allTags.length > 0 && (
                    <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
                      <div className="flex items-center gap-2 mb-3">
                        <motion.div
                          animate={{ rotate: [0, 10, -10, 0] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <HashtagIcon className="w-4 h-4 text-purple-500" />
                        </motion.div>
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                          Smart Tags
                        </h3>
                        <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                          {allTags.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {allTags.slice(0, 12).map((tag) => (
                          <motion.button
                            key={tag}
                            onClick={() => setSearchQuery(tag)}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs bg-gradient-to-r from-white to-gray-50 dark:from-slate-800 dark:to-slate-700 text-gray-700 dark:text-slate-300 hover:from-purple-100 hover:to-blue-100 dark:hover:from-purple-900/30 dark:hover:to-blue-900/30 hover:text-purple-700 dark:hover:text-purple-300 transition-all border border-gray-200 dark:border-slate-600 hover:border-purple-300 dark:hover:border-purple-600 shadow-sm hover:shadow-md"
                          >
                            <HashtagIcon className="w-3 h-3 mr-1" />
                            {tag}
                          </motion.button>
                        ))}
                        {allTags.length > 12 && (
                          <motion.button
                            onClick={() => setActiveTab('all')}
                            whileHover={{ scale: 1.05 }}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs bg-gradient-to-r from-gray-100 to-gray-200 dark:from-slate-700 dark:to-slate-600 text-gray-600 dark:text-slate-400 hover:from-purple-100 hover:to-blue-100 dark:hover:from-purple-900/30 dark:hover:to-blue-900/30 hover:text-purple-600 dark:hover:text-purple-400 transition-all border border-gray-300 dark:border-slate-600 hover:border-purple-400 dark:hover:border-purple-500"
                          >
                            <EyeIcon className="w-3 h-3 mr-1" />
                            +{allTags.length - 12} more
                          </motion.button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
