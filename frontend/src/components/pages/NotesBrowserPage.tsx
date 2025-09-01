'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  EyeIcon,
  TrashIcon,
  CalendarIcon,
  TagIcon,
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FunnelIcon,
  XMarkIcon,
  ViewColumnsIcon,
  Squares2X2Icon,
  ListBulletIcon
} from '@heroicons/react/24/outline'
import { DocumentTextIcon as DocumentTextSolid } from '@heroicons/react/24/solid'
import { useMascot } from '@/contexts/MascotContext'
import appBus from '@/lib/appBus'
import { useNotesApi, useSearchApi, useTagsApi } from '@/services/apiClient'
import { NoteEditorAI } from '@/components/editor/NoteEditorAI'
import { useJobsApi } from '@/services/apiClient'

interface Note {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  tags?: string[]
  metadata?: {
    source?: string
    fileType?: string
    chunkCount?: number
    wordCount?: number
  }
  status?: {
    chunkCount: number
    embeddingCount: number
    embeddingCoverage: number // 0..1
    indexingStatus: 'none' | 'partial' | 'complete'
    searchReady: boolean
    tagged: boolean
    classified: boolean
    redactionRequired: boolean
    hasPii: boolean
    hasSecrets: boolean
    sensitivityLevel: number
  }
}

interface SortOption {
  field: 'title' | 'createdAt' | 'updatedAt' | 'wordCount'
  direction: 'asc' | 'desc'
  label: string
}

interface FilterOptions {
  tags: string[]
  fromDate?: string
  toDate?: string
  sources: string[]
  minWordCount?: number
  maxWordCount?: number
}

type ViewMode = 'list' | 'grid' | 'compact'

// Lightweight, memoized Note Card to avoid unnecessary re-renders
interface NoteCardProps {
  note: Note
  viewMode: ViewMode
  highlighted: boolean
  onClick: () => void
}

const NoteCardBase: React.FC<NoteCardProps> = ({ note, viewMode, highlighted, onClick }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const coverageWidthClass = () => {
    const pct = Math.round(((note.status?.embeddingCoverage ?? 0) * 100))
    if (pct <= 0) return 'w-0'
    if (pct < 10) return 'w-[8%]'
    if (pct < 25) return 'w-1/5'
    if (pct < 35) return 'w-1/3'
    if (pct < 50) return 'w-2/5'
    if (pct < 65) return 'w-1/2'
    if (pct < 75) return 'w-3/5'
    if (pct < 85) return 'w-2/3'
    if (pct < 95) return 'w-5/6'
    return 'w-full'
  }

  const getExcerpt = (content: string, maxLength = 150) => {
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength) + '...'
  }

  const formatTagForDisplay = (tag: string) => {
    // Replace underscores with spaces and apply title case
    return tag
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
  }

  const IndexBadge = () => {
    const s = note.status
    if (!s) return null
    const color = s.indexingStatus === 'complete' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
      : s.indexingStatus === 'partial' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
    const label = s.indexingStatus === 'complete' ? 'Indexed' : s.indexingStatus === 'partial' ? 'Indexing…' : 'Not indexed'
    return <span className={`px-2 py-0.5 rounded-full text-[10px] ${color}`}>{label}</span>
  }

  const SearchReadyBadge = () => {
    const s = note.status
    if (!s) return null
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] ${s.searchReady ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
        {s.searchReady ? 'Search-ready' : 'Not search-ready'}
      </span>
    )
  }

  const SensitiveBadges = () => {
    const s = note.status
    if (!s) return null
    
    // Parse PII and secret flags to show specific types detected
    const parseFlagsToTypes = (flags: string) => {
      if (!flags) return []
      // PII/Secret flags might be comma-separated or JSON array strings
      try {
        // Try parsing as JSON first
        if (flags.startsWith('[') && flags.endsWith(']')) {
          const parsed = JSON.parse(flags)
          return Array.isArray(parsed) ? parsed : []
        }
        // Otherwise split by comma
        return flags.split(',').map(f => f.trim()).filter(Boolean)
      } catch {
        return flags.split(',').map(f => f.trim()).filter(Boolean)
      }
    }

    const formatDetectionType = (type: string) => {
      // Convert technical names to user-friendly labels
      const typeMap: Record<string, string> = {
        'EMAIL': 'Email',
        'PHONE': 'Phone',
        'AU_PHONE': 'Phone',
        'AU_TFN': 'Tax File Number',
        'AU_MEDICARE': 'Medicare',
        'AU_ABN': 'ABN',
        'CREDIT_CARD': 'Credit Card',
        'US_SSN': 'SSN',
        'IBAN': 'Bank Account',
        'SWIFT_BIC': 'Bank Code',
        'DRIVERS_LICENSE': 'License',
        'PASSPORT': 'Passport',
        'API_KEY': 'API Key',
        'PASSWORD': 'Password',
        'JWT_TOKEN': 'Token',
        'AWS_ACCESS_KEY': 'AWS Key',
        'GITHUB_TOKEN': 'GitHub Token',
        'PRIVATE_KEY': 'Private Key'
      }
      return typeMap[type.toUpperCase()] || type.replace(/_/g, ' ')
    }

    // Get the actual PII and secret flag strings from the note
    const piiFlags = (note as any).piiFlags || (note as any).PiiFlags || ''
    const secretFlags = (note as any).secretFlags || (note as any).SecretFlags || ''
    
    const piiTypes = parseFlagsToTypes(piiFlags)
    const secretTypes = parseFlagsToTypes(secretFlags)

    return (
      <div className="flex flex-wrap items-center gap-1">
        {s.redactionRequired && (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">Sensitive</span>
        )}
        {s.hasPii && piiTypes.length > 0 && (
          <span 
            className="px-2 py-0.5 rounded-full text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 cursor-help"
            title={`PII Detected: ${piiTypes.map(formatDetectionType).join(', ')}`}
          >
            PII ({piiTypes.length})
          </span>
        )}
        {s.hasPii && piiTypes.length === 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">PII</span>
        )}
        {s.hasSecrets && secretTypes.length > 0 && (
          <span 
            className="px-2 py-0.5 rounded-full text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 cursor-help"
            title={`Secrets Detected: ${secretTypes.map(formatDetectionType).join(', ')}`}
          >
            Secrets ({secretTypes.length})
          </span>
        )}
        {s.hasSecrets && secretTypes.length === 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Secrets</span>
        )}
      </div>
    )
  }

  const TagBadge = () => {
    const s = note.status
    const tagged = s ? s.tagged : (note.tags && note.tags.length > 0)
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] ${tagged ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
        {tagged ? 'Tagged' : 'Untagged'}
      </span>
    )
  }

  const ClassifiedBadge = () => {
    const s = note.status
    if (!s) return null
    const isClassified = Boolean(s.classified)
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] ${isClassified ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
        {isClassified ? 'Classified' : 'Unclassified'}
      </span>
    )
  }

  return (
    <motion.div
      // Turn off layout animations to avoid any perceived flicker
      layout={false}
      initial={false}
      animate={{ boxShadow: highlighted ? '0 0 20px rgba(139, 92, 246, 0.5)' : '0 1px 3px rgba(0, 0, 0, 0.1)' }}
      transition={{ type: 'tween', duration: 0.18 }}
      className={`bg-white dark:bg-gray-800 rounded-xl border transition-colors duration-200 cursor-pointer overflow-hidden ${
        highlighted 
          ? 'border-purple-500 dark:border-purple-400 shadow-lg shadow-purple-500/25' 
          : 'border-gray-200 dark:border-gray-700 hover:shadow-md'
      }`}
      onClick={onClick}
      whileHover={{ y: -2 }}
      id={`note-${note.id}`}
    >
      {viewMode === 'grid' ? (
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg line-clamp-2">
              {note.title}
            </h3>
            <DocumentTextSolid className="w-5 h-5 text-purple-500 flex-shrink-0 ml-2" />
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-3 mb-4">
            {getExcerpt(note.content)}
          </p>
          <div className="flex flex-wrap gap-1 mb-3">
            {note.tags?.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="px-2 py-1 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 text-xs rounded-full"
              >
                {formatTagForDisplay(tag)}
              </span>
            ))}
            {(note.tags?.length || 0) > 3 && (
              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs rounded-full">
                +{(note.tags?.length || 0) - 3}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{formatDate(note.updatedAt)}</span>
            <span>{note.metadata?.wordCount || 0} words</span>
          </div>
          {/* Status badges */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-1">
              <IndexBadge />
              <SearchReadyBadge />
              <TagBadge />
              <ClassifiedBadge />
            </div>
            <SensitiveBadges />
          </div>
          {/* Coverage bar */}
          {note.status && (
            <div className="mt-2">
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded">
                <div className={`h-1.5 bg-purple-500 rounded ${coverageWidthClass()}`} />
              </div>
              <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Embedding coverage: {Math.round((note.status.embeddingCoverage || 0) * 100)}%</div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 dark:text-white truncate">
                {note.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 line-clamp-2">
                {getExcerpt(note.content, viewMode === 'compact' ? 80 : 120)}
              </p>
              {viewMode === 'list' && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {note.tags?.slice(0, 4).map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 text-xs rounded"
                    >
                      {formatTagForDisplay(tag)}
                    </span>
                  ))}
                  {/* Status badges (compact) */}
                  <IndexBadge />
                  <SearchReadyBadge />
                  <TagBadge />
                  <ClassifiedBadge />
                  <SensitiveBadges />
                </div>
              )}
            </div>
            <div className="flex items-center space-x-3 ml-4">
              <div className="text-right">
                <div className="text-xs text-gray-500">
                  {formatDate(note.updatedAt)}
                </div>
                <div className="text-xs text-gray-400">
                  {note.metadata?.wordCount || 0} words
                </div>
              </div>
              <EyeIcon className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

const NoteCard = React.memo(
  NoteCardBase,
  (prev, next) => prev.note === next.note && prev.viewMode === next.viewMode && prev.highlighted === next.highlighted
)

NoteCard.displayName = 'NoteCard'

const NotesBrowserPage: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([])
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  // Notes API helpers
  const { updateNote, getNote, getNotes } = useNotesApi()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null)
  const [sortOption, setSortOption] = useState<SortOption>({
    field: 'updatedAt',
    direction: 'desc',
    label: 'Recently Updated'
  })
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterOptions>({
    tags: [],
    sources: []
  })
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [availableSources, setAvailableSources] = useState<string[]>([])
  const [pagination, setPagination] = useState({
    currentPage: 1,
    pageSize: 20,
    total: 0
  })

  const { speak, think, idle, suggest } = useMascot()
  // getNotes is obtained above from useNotesApi
  const { searchGet } = useSearchApi()
  const { getAllTags } = useTagsApi()
  const { enqueueGraphEnrich } = useJobsApi()

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

  const sortOptions: SortOption[] = [
    { field: 'updatedAt', direction: 'desc', label: 'Recently Updated' },
    { field: 'createdAt', direction: 'desc', label: 'Recently Created' },
    { field: 'title', direction: 'asc', label: 'Title A-Z' },
    { field: 'title', direction: 'desc', label: 'Title Z-A' },
    { field: 'wordCount', direction: 'desc', label: 'Longest First' },
    { field: 'wordCount', direction: 'asc', label: 'Shortest First' }
  ]

  // Load notes with pagination
  const firstLoadDone = useRef(false)

  const loadNotes = useCallback(async (page = 1, background = false) => {
    // Show initial spinner only on first load; later loads use a small overlay
    if (!firstLoadDone.current && !background) {
      setIsLoading(true)
    } else {
      setRefreshing(true)
    }
    think()

    try {
      const notesData = await getNotes()
      
      // Transform the data to match our interface
      const toTagArray = (raw: any): string[] => {
        if (!raw) return []
        if (Array.isArray(raw)) return raw.filter(Boolean).map(String)
        if (typeof raw === 'string') {
          const s = raw.trim()
          // Try JSON array first
          if (s.startsWith('[') && s.endsWith(']')) {
            try {
              const parsed = JSON.parse(s)
              if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String)
            } catch { /* fall through */ }
          }
          // Fallback: CSV or semicolon separated
          return s.split(/[;,]/).map(t => t.trim()).filter(Boolean)
        }
        return []
      }

      const transformedNotes: Note[] = notesData.map((note: any) => {
        const content = note.content || note.Content || ''
        const rawTags = note.tags ?? note.Tags
        const tags = toTagArray(rawTags)
        const s = note.Status || note.status || {}
        return {
          id: note.id || note.Id || note.noteId,
          title: note.title || note.Title || `Note ${note.id ?? ''}`,
          content,
          createdAt: note.createdAt || note.CreatedAt || new Date().toISOString(),
          updatedAt: note.updatedAt || note.UpdatedAt || note.createdAt || note.CreatedAt || new Date().toISOString(),
          tags,
          metadata: {
            source: note.source || note.Source,
            fileType: note.fileType || note.FileType,
            chunkCount: note.chunkCount || note.ChunkCount || 0,
            // Use Preview field for word count when Content is empty (includeContent=false)
            wordCount: (() => {
              // When includeContent=false, content will be empty string, so use Preview field
              const contentToCount = (content && content.trim()) ? content : 
                (note.Preview || note.preview || '');
              if (!contentToCount || !contentToCount.trim()) return 0;
              const words = contentToCount.trim().split(/\s+/).filter((word: string) => word.length > 0);
              return words.length;
            })(),
          },
          status: {
            chunkCount: s.ChunkCount ?? s.chunkCount ?? (note.chunkCount || note.ChunkCount || 0),
            embeddingCount: s.EmbeddingCount ?? s.embeddingCount ?? 0,
            embeddingCoverage: s.EmbeddingCoverage ?? s.embeddingCoverage ?? 0,
            indexingStatus: (s.IndexingStatus ?? s.indexingStatus ?? 'none') as 'none'|'partial'|'complete',
            searchReady: Boolean(s.SearchReady ?? s.searchReady ?? false),
            tagged: Boolean(s.Tagged ?? s.tagged ?? (tags.length > 0)),
            classified: Boolean(s.Classified ?? s.classified ?? false),
            redactionRequired: Boolean(s.RedactionRequired ?? s.redactionRequired ?? false),
            hasPii: Boolean(s.HasPii ?? s.hasPii ?? false),
            hasSecrets: Boolean(s.HasSecrets ?? s.hasSecrets ?? false),
            sensitivityLevel: s.SensitivityLevel ?? s.sensitivityLevel ?? (note.sensitivityLevel || note.SensitivityLevel || 0),
          }
        }
      })

      // Minimize flicker: keep stable object refs for unchanged notes
      setNotes(prev => {
        const prevById = new Map(prev.map(n => [n.id, n]))
        return transformedNotes.map(n => prevById.get(n.id) ?? n)
      })
      setPagination(prev => ({
        ...prev,
        currentPage: page,
        total: transformedNotes.length
      }))

      // Extract available tags and sources
      const tags = Array.from(new Set(transformedNotes.flatMap(note => Array.isArray(note.tags) ? note.tags : [])))
      const sources = Array.from(new Set(transformedNotes.map(note => note.metadata?.source).filter(Boolean)))
      setAvailableTags(tags)
      setAvailableSources(sources as string[])

      speak(`Loaded ${transformedNotes.length} notes from your knowledge base`, 'responding')
    } catch (error) {
      console.error('Failed to load notes:', error)
      speak('Sorry, I had trouble loading your notes. Please try again.', 'error')
    } finally {
      if (!firstLoadDone.current) {
        setIsLoading(false)
        firstLoadDone.current = true
      }
      // Small debounce so quick fetches don't flash the overlay
      setTimeout(() => setRefreshing(false), 120)
      idle()
    }
  }, [getNotes, speak, think, idle])

  // Initial load
  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  // Listen for app-wide notes updates and reload
  useEffect(() => {
    const off = appBus.on('notes:updated', () => {
      loadNotes(1, true)
    })
    return off
  }, [loadNotes])

  // Check for highlighted note from global search
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const selectedNoteId = window.localStorage.getItem('selectedNoteId')
      if (selectedNoteId) {
        setHighlightedNoteId(selectedNoteId)
        // Clear the stored note ID
        window.localStorage.removeItem('selectedNoteId')
        // Auto-scroll to the note after a brief delay
        setTimeout(() => {
          const element = document.getElementById(`note-${selectedNoteId}`)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 500)
        // Clear highlight after a few seconds
        setTimeout(() => {
          setHighlightedNoteId(null)
        }, 3000)
      }
    }
  }, [notes]) // Re-run when notes are loaded

  // Apply search and filters
  useEffect(() => {
    let filtered = [...notes]

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(note =>
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        note.tags?.some(tag => tag.toLowerCase().includes(query))
      )
    }

    // Apply filters
    if (filters.tags.length > 0) {
      filtered = filtered.filter(note =>
        note.tags?.some(tag => filters.tags.includes(tag))
      )
    }

    if (filters.sources.length > 0) {
      filtered = filtered.filter(note =>
        note.metadata?.source && filters.sources.includes(note.metadata.source)
      )
    }

    if (filters.fromDate) {
      filtered = filtered.filter(note =>
        new Date(note.createdAt) >= new Date(filters.fromDate!)
      )
    }

    if (filters.toDate) {
      filtered = filtered.filter(note =>
        new Date(note.createdAt) <= new Date(filters.toDate!)
      )
    }

    if (filters.minWordCount) {
      filtered = filtered.filter(note =>
        (note.metadata?.wordCount || 0) >= filters.minWordCount!
      )
    }

    if (filters.maxWordCount) {
      filtered = filtered.filter(note =>
        (note.metadata?.wordCount || 0) <= filters.maxWordCount!
      )
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortOption.field === 'wordCount') {
        const aCount = a.metadata?.wordCount || 0
        const bCount = b.metadata?.wordCount || 0
        return sortOption.direction === 'asc' ? aCount - bCount : bCount - aCount
      }
      
      const aValue = sortOption.field === 'title' ? a.title : 
                    sortOption.field === 'createdAt' ? a.createdAt :
                    sortOption.field === 'updatedAt' ? a.updatedAt : ''
      const bValue = sortOption.field === 'title' ? b.title : 
                    sortOption.field === 'createdAt' ? b.createdAt :
                    sortOption.field === 'updatedAt' ? b.updatedAt : ''
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOption.direction === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }
      
      return 0
    })

    setFilteredNotes(filtered)
  }, [notes, searchQuery, filters, sortOption])

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      tags: [],
      sources: []
    })
    setSearchQuery('')
    speak('All filters cleared!', 'idle')
  }

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Get note excerpt
  const getExcerpt = (content: string, maxLength = 150) => {
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength) + '...'
  }

  // Note Card was extracted and memoized above

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <motion.h1 
              className="text-4xl font-bold text-gray-900 dark:text-white mb-2"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              My Notes
            </motion.h1>
            <motion.p 
              className="text-lg text-gray-600 dark:text-gray-400"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Browse and manage your knowledge base
            </motion.p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center space-x-2">
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-2 ${viewMode === 'list' ? 'bg-purple-500 text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                <ListBulletIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                title="Grid view"
                className={`p-2 ${viewMode === 'grid' ? 'bg-purple-500 text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                <Squares2X2Icon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                title="Compact view"
                className={`p-2 ${viewMode === 'compact' ? 'bg-purple-500 text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                <ViewColumnsIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Search and Filters Bar */}
        <motion.div 
          className="mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            {/* Search Input */}
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your notes..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={`${sortOption.field}-${sortOption.direction}`}
                onChange={(e) => {
                  const [field, direction] = e.target.value.split('-')
                  const option = sortOptions.find(opt => opt.field === field && opt.direction === direction)
                  if (option) setSortOption(option)
                }}
                title="Sort options"
                className="appearance-none pl-4 pr-10 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {sortOptions.map(option => (
                  <option key={`${option.field}-${option.direction}`} value={`${option.field}-${option.direction}`}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>

            {/* Filters Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <FunnelIcon className="w-5 h-5" />
              <span>Filters</span>
              {(filters.tags.length > 0 || filters.sources.length > 0) && (
                <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full">
                  {filters.tags.length + filters.sources.length}
                </span>
              )}
            </button>
          </div>

          {/* Advanced Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filters</h3>
                    <button
                      onClick={clearFilters}
                      className="text-sm text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Tags Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tags
                      </label>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {availableTags.map(tag => (
                          <label key={tag} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={filters.tags.includes(tag)}
                              onChange={(e) => {
                                setFilters(prev => ({
                                  ...prev,
                                  tags: e.target.checked
                                    ? [...prev.tags, tag]
                                    : prev.tags.filter(t => t !== tag)
                                }))
                              }}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{tag}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Sources Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Sources
                      </label>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {availableSources.map(source => (
                          <label key={source} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={filters.sources.includes(source)}
                              onChange={(e) => {
                                setFilters(prev => ({
                                  ...prev,
                                  sources: e.target.checked
                                    ? [...prev.sources, source]
                                    : prev.sources.filter(s => s !== source)
                                }))
                              }}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{source}</span>
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
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="From"
                        />
                        <input
                          type="date"
                          value={filters.toDate || ''}
                          onChange={(e) => setFilters(prev => ({ ...prev, toDate: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="To"
                        />
                      </div>
                    </div>

                    {/* Word Count Range */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Word Count
                      </label>
                      <div className="space-y-2">
                        <input
                          type="number"
                          value={filters.minWordCount || ''}
                          onChange={(e) => setFilters(prev => ({ ...prev, minWordCount: e.target.value ? parseInt(e.target.value) : undefined }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="Min words"
                        />
                        <input
                          type="number"
                          value={filters.maxWordCount || ''}
                          onChange={(e) => setFilters(prev => ({ ...prev, maxWordCount: e.target.value ? parseInt(e.target.value) : undefined }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="Max words"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Stats Bar */}
        <motion.div 
          className="flex items-center justify-between mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center space-x-6">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing <span className="font-medium text-gray-900 dark:text-white">{filteredNotes.length}</span> of <span className="font-medium text-gray-900 dark:text-white">{notes.length}</span> notes
            </div>
            {searchQuery && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Search: <span className="font-medium text-purple-600 dark:text-purple-400">&quot;{searchQuery}&quot;</span>
              </div>
            )}
          </div>
          {/* Pagination controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadNotes(Math.max(1, pagination.currentPage - 1), true)}
              disabled={pagination.currentPage <= 1 || isLoading || refreshing}
              className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-sm disabled:opacity-50"
            >Prev</button>
            <span className="text-xs text-gray-600 dark:text-gray-400">Page {pagination.currentPage}</span>
            <button
              onClick={() => loadNotes(pagination.currentPage + 1, true)}
              disabled={isLoading || refreshing || notes.length < pagination.pageSize}
              className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-sm disabled:opacity-50"
            >Next</button>
          </div>

          {filteredNotes.length > 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Total: {filteredNotes.reduce((sum, note) => sum + (note.metadata?.wordCount || 0), 0)} words
            </div>
          )}
        </motion.div>

        {/* Notes Grid/List */}
        {filteredNotes.length > 0 ? (
          <div
            className={
              viewMode === 'grid' 
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                : 'space-y-4'
            }
          >
            {filteredNotes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                viewMode={viewMode}
                highlighted={highlightedNoteId === note.id}
                onClick={async () => {
                  setSelectedNote(note)
                  try {
                    const full = await getNote(note.id)
                    setSelectedNote({ ...note, content: full?.content || full?.Content || note.content })
                  } catch {}
                }}
              />
            ))}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full"
            />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <DocumentTextIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {searchQuery || Object.values(filters).some(f => Array.isArray(f) ? f.length > 0 : Boolean(f))
                ? 'No notes found'
                : 'No notes yet'
              }
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchQuery || Object.values(filters).some(f => Array.isArray(f) ? f.length > 0 : Boolean(f))
                ? 'Try adjusting your search or filters'
                : 'Start by uploading some documents or creating notes'
              }
            </p>
          </motion.div>
        )}

        {/* Loading overlay to avoid flicker during background refresh */}
  {refreshing && filteredNotes.length > 0 && (
          <div className="fixed inset-x-0 bottom-12 flex justify-center pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 dark:bg-gray-800/70 shadow border border-gray-200 dark:border-gray-700">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full"
              />
              <span className="text-xs text-gray-600 dark:text-gray-300">Refreshing…</span>
            </div>
          </div>
        )}

        {/* Note Viewer Modal */}
        <AnimatePresence>
          {selectedNote && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
              onClick={() => setSelectedNote(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <>
                      <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                        <div>
                          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            {selectedNote.title}
                          </h2>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                            <span>Created: {formatDate(selectedNote.createdAt)}</span>
                            <span>Updated: {formatDate(selectedNote.updatedAt)}</span>
                            <span>{selectedNote.metadata?.wordCount || 0} words</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditing((e) => !e)}
                            className={`px-3 py-1.5 rounded-lg text-sm ${editing ? 'bg-gray-200 dark:bg-gray-700' : 'bg-purple-600 text-white'}`}
                            title={editing ? 'Exit edit mode' : 'Edit note'}
                          >{editing ? 'Viewing' : 'Edit'}</button>
                          <button
                            onClick={async () => { try { if (selectedNote) await enqueueGraphEnrich(selectedNote.id) } catch {} }}
                            className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700"
                            title="Trigger knowledge graph enrichment for this note"
                          >Build Graph Now</button>
                          <button
                            onClick={() => setSelectedNote(null)}
                            title="Close modal"
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          >
                            <XMarkIcon className="w-6 h-6 text-gray-500" />
                          </button>
                        </div>
                      </div>
                      <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
                        {editing ? (
                          <NoteEditorAI
                            initialContent={selectedNote.content}
                            onSave={async (text) => {
                              if (!selectedNote) return
                              setSaving(true)
                              try {
                                await updateNote(selectedNote.id, text, selectedNote.title)
                                setSelectedNote({ ...selectedNote, content: text, updatedAt: new Date().toISOString() })
                                // Refresh notes list in background to update statuses/coverage
                                try { await loadNotes(pagination.currentPage, true) } catch {}
                              } finally {
                                setSaving(false)
                                setEditing(false)
                              }
                            }}
                          />
                        ) : (
                          <>
                            {selectedNote.tags && selectedNote.tags.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-6">
                                {selectedNote.tags.map(tag => (
                                  <span
                                    key={tag}
                                    className="px-3 py-1 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 text-sm rounded-full"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="prose dark:prose-invert max-w-none">
                              {selectedNote.content.split('\n').map((paragraph, index) => (
                                <p key={index} className="mb-4 leading-relaxed">
                                  {paragraph}
                                </p>
                              ))}
                            </div>
                          </>
                        )}
                        {saving && (
                          <div className="mt-3 text-xs text-gray-500">Saving…</div>
                        )}
                      </div>
                    </>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default NotesBrowserPage
