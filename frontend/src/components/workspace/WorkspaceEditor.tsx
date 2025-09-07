'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  DocumentTextIcon,
  EyeIcon,
  PencilIcon,
  BookmarkIcon,
  TagIcon,
  CalendarIcon,
  ArrowLeftIcon,
  ClipboardDocumentIcon,
  SparklesIcon,
  TrashIcon,
  BoltIcon,
  ScissorsIcon
} from '@heroicons/react/24/outline'
import { useWorkspaceApi, useNotesApi, useAssistApi, useClassificationApi, useTagsApi, useGraphApi } from '../../services/apiClient'
import { NoteEditorAI } from '@/components/editor/NoteEditorAI'
import ProgressDialog from '@/components/common/ProgressDialog'
import { formatRelativeTime, formatTimeWithTooltip } from '@/lib/timeUtils'
import DeletionPlanDialog from '@/components/dialogs/DeletionPlanDialog'

interface WorkspaceEditorProps {
  noteId: string | null
  onBack: () => void
  isVisible: boolean
}

interface Note {
  id: string
  title: string
  content: string
  tags?: string[]
  createdAt?: string
  lastModified?: string
}

interface EditorState {
  cursorPosition?: number
  scrollPosition?: number
  selection?: { start: number; end: number }
}

export default function WorkspaceEditor({ noteId, onBack, isVisible }: WorkspaceEditorProps) {
  const [note, setNote] = useState<Note | null>(null)
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>()
  
  const { updateWorkspace, trackNoteAccess } = useWorkspaceApi()
  const { getNote, updateNote, deleteNote, getDeletionPlan } = useNotesApi()
  const { assist, generateSummary, classifyContent } = useAssistApi()
  const { classifyNote } = useClassificationApi()
  const { rebuildGraph } = useGraphApi()
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiOutput, setAiOutput] = useState('')
  const [savedSummary, setSavedSummary] = useState<string>('')
  const [savedSummaryAt, setSavedSummaryAt] = useState<string>('')
  const [showRecent, setShowRecent] = useState(false)
  const [recentNotes, setRecentNotes] = useState<Array<{ id: string, title: string, updatedAt?: string }>>([])
  const [tagInput, setTagInput] = useState('')
  
  // Progress dialog state
  const [progressDialog, setProgressDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    progress?: number
  }>({
    isOpen: false,
    title: '',
    message: '',
    progress: undefined
  })

  // Deletion dialog state
  const [deletionDialog, setDeletionDialog] = useState<{
    isOpen: boolean
    noteId: string | null
    noteTitle: string | null
  }>({
    isOpen: false,
    noteId: null,
    noteTitle: null
  })
  
  // Text selection state
  const [selectedText, setSelectedText] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[] | null>(null)
  const tagsApi = useTagsApi()
  const [allTags, setAllTags] = useState<string[]>([])
  const [toast, setToast] = useState<string>('')

  // Helper: refresh note tags from API
  const refreshNoteTags = useCallback(async (id: string) => {
    try {
      const fresh = await tagsApi.getForNote(id)
      const tags: string[] = fresh?.tags ?? fresh?.Tags ?? []
      setNote(prev => (prev && prev.id === id) ? { ...prev, tags } : prev)
    } catch {/* ignore */}
  }, [tagsApi])

  // Load all tags once for autocomplete
  useEffect(() => {
    (async () => {
      try {
     const res = await tagsApi.getAllTags()
     // getAllTags returns a string[] of tag names via generated client
     const names = Array.isArray(res)
    ? res.map((t: any) => (typeof t === 'string' ? t : (t?.name || t?.Name)))
      .filter(Boolean)
    : []
        setAllTags(Array.from(new Set(names)))
      } catch {/* ignore */}
    })()
  }, [tagsApi])

  // Load note data
  const loadNote = useCallback(async (id: string) => {
    try {
      setLoading(true)
      setError(null)
      
      const noteData = await getNote(id)
      // Normalize fields for consistent UI
      const created = noteData.createdAt || noteData.CreatedAt
      const updated = noteData.updatedAt || noteData.UpdatedAt
      const tagsRaw = noteData.tags ?? noteData.Tags ?? ''
      const tags: string[] = Array.isArray(tagsRaw)
        ? tagsRaw
        : (typeof tagsRaw === 'string' && tagsRaw.trim().length > 0
            ? tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [])
      setNote({
        id: noteData.id || noteData.Id,
        title: noteData.title || noteData.Title || '',
        content: noteData.content || noteData.Content || '',
        tags,
        createdAt: created,
        lastModified: updated,
      })
      setContent(noteData.content || noteData.Content || '')
      setTitle(noteData.title || noteData.Title || '')
      setHasUnsavedChanges(false)
      
      // Track note access in workspace
      await trackNoteAccess(id, 'view', 0)
      
      // Update workspace active note
      await updateWorkspace({ activeNoteId: id })
      
    } catch (e: any) {
      console.error('Failed to load note:', e)
      setError(e?.message || 'Failed to load note')
    } finally {
      setLoading(false)
    }
  }, [getNote, trackNoteAccess, updateWorkspace])

  // Save note changes
  const saveNote = useCallback(async (forceImmediate = false) => {
    if (!note || (!hasUnsavedChanges && !forceImmediate)) return
    
    try {
      setSaving(true)
      
      const editorState: EditorState = {}
      if (textareaRef.current) {
        editorState.cursorPosition = textareaRef.current.selectionStart
        editorState.scrollPosition = textareaRef.current.scrollTop
        if (textareaRef.current.selectionStart !== textareaRef.current.selectionEnd) {
          editorState.selection = {
            start: textareaRef.current.selectionStart,
            end: textareaRef.current.selectionEnd
          }
        }
      }

      // For autosave, skip heavy processing (classification/embeddings); for explicit save, run full pipeline
      await updateNote(note.id, content, title.trim() || 'Untitled Note', !forceImmediate)
      
      // Update workspace editor state
      await updateWorkspace({ 
        editorState,
        activeNoteId: note.id
      })
      
      // Track editing session
      await trackNoteAccess(note.id, 'edit', 0, editorState)
      
      setNote(prev => prev ? { 
        ...prev, 
        title: title.trim() || 'Untitled Note',
        content,
        lastModified: new Date().toISOString()
      } : null)
      setHasUnsavedChanges(false)
      setLastSavedAt(new Date().toLocaleTimeString())
      
    } catch (e: any) {
      console.error('Failed to save note:', e)
      setError(e?.message || 'Failed to save note')
    } finally {
      setSaving(false)
    }
  }, [note, hasUnsavedChanges, title, content, updateNote, updateWorkspace, trackNoteAccess])

  // Auto-save functionality
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      if (hasUnsavedChanges) {
        saveNote()
      }
    }, 2000) // Auto-save after 2 seconds of inactivity
  }, [hasUnsavedChanges, saveNote])

  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent)
    setHasUnsavedChanges(true)
    scheduleAutoSave()
  }, [scheduleAutoSave])

  // Handle title changes
  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle)
    setHasUnsavedChanges(true)
    scheduleAutoSave()
  }, [scheduleAutoSave])

  // Handle note deletion
  const handleDeleteNote = useCallback(async () => {
    if (!note) return
    
    setDeletionDialog({
      isOpen: true,
      noteId: note.id,
      noteTitle: note.title
    })
  }, [note])

  // Confirm deletion handler
  const confirmDeleteNote = useCallback(async () => {
    if (!deletionDialog.noteId) return
    
    try {
      setLoading(true)
      await deleteNote(deletionDialog.noteId)
      // Navigate back after successful deletion
      onBack()
    } catch (error: any) {
      console.error('Failed to delete note:', error)
      setError(`Failed to delete note: ${error.message || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [deletionDialog.noteId, deleteNote, onBack])

  // Restore editor state when note loads
  const restoreEditorState = useCallback(async () => {
    if (!noteId) return
    
    try {
      const workspace = await updateWorkspace({}) // Get current workspace
      const editorState = workspace?.editorState as EditorState
      
      if (editorState && textareaRef.current) {
        // Restore cursor position
        if (editorState.cursorPosition !== undefined) {
          textareaRef.current.setSelectionRange(
            editorState.cursorPosition,
            editorState.cursorPosition
          )
        }
        
        // Restore selection
        if (editorState.selection) {
          textareaRef.current.setSelectionRange(
            editorState.selection.start,
            editorState.selection.end
          )
        }
        
        // Restore scroll position
        if (editorState.scrollPosition !== undefined) {
          textareaRef.current.scrollTop = editorState.scrollPosition
        }
      }
    } catch (e) {
      console.warn('Failed to restore editor state:', e)
    }
  }, [noteId, updateWorkspace])

  // Load note when noteId changes
  useEffect(() => {
    if (noteId) {
      loadNote(noteId)
    } else {
      setNote(null)
      setContent('')
      setTitle('')
      setHasUnsavedChanges(false)
    }
  }, [noteId, loadNote])

  // Restore editor state after content loads
  useEffect(() => {
    if (note && content && textareaRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(restoreEditorState, 100)
    }
  }, [note, content, restoreEditorState])

  // Cleanup auto-save timeout
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') {
        e.preventDefault()
        saveNote(true)
      }
    }
  }, [saveNote])

  // Toggle and load recent notes (dedup by id)
  const { getRecentNotes } = useWorkspaceApi()
  const loadRecent = useCallback(async () => {
    try {
      const items = await getRecentNotes(20)
      const seen = new Set<string>()
      const list: Array<{ id: string, title: string, updatedAt?: string }> = []
      for (const n of items || []) {
        const id = n.id || n.Id || n.noteId || n.NoteId
        if (!id || seen.has(id)) continue
        seen.add(id)
        list.push({ id, title: n.title || n.Title || 'Untitled', updatedAt: n.updatedAt || n.UpdatedAt })
      }
      setRecentNotes(list)
    } catch {/* ignore */}
  }, [getRecentNotes])

  // Open a recent note directly in the editor
  const openRecent = useCallback(async (id: string) => {
    setShowRecent(false)
    await loadNote(id)
    setIsEditing(true)
  }, [loadNote])

  // Inline tag editor handlers (local-only for now)
  const addTag = useCallback(async () => {
    const t = tagInput.trim()
    if (!note || !t) return
    if ((note.tags || []).includes(t)) { setTagInput(''); return }
    try {
      await tagsApi.addToNote(note.id, [t])
      const fresh = await tagsApi.getForNote(note.id)
      const tags: string[] = fresh?.tags ?? fresh?.Tags ?? []
      setNote(prev => prev ? { ...prev, tags } : prev)
    } finally {
      setTagInput('')
    }
  }, [tagInput, note, tagsApi])

  const removeTag = useCallback(async (t: string) => {
    if (!note) return
    await tagsApi.removeFromNote(note.id, [t])
    const fresh = await tagsApi.getForNote(note.id)
    const tags: string[] = fresh?.tags ?? fresh?.Tags ?? []
    setNote(prev => prev ? { ...prev, tags } : prev)
  }, [note, tagsApi])

  // AI: Generate tags (suggestions)
  const aiGenerateTags = useCallback(async () => {
    if (!content) return
    setAiBusy(true)
    setAiOutput('')
    try {
      const prompt = 'Generate 3-8 concise tags for the following note content. Return a comma-separated list only.'
      const res = await assist({ mode: 'suggest', prompt, context: content.slice(0, 4000), maxTokens: 60, temperature: 0.2 })
      const raw = (res?.text || '').trim()
      const list = raw
        .replace(/^[\[\(\{]/, '').replace(/[\]\)\}]$/, '')
        .split(/[,\n]/)
        .map((s: string) => s.replace(/(^["']|["']$)/g, '').trim())
        .filter(Boolean)
      setTagSuggestions(list.length ? Array.from(new Set(list)) : [])
      setAiOutput(list.length ? `Suggested tags: ${list.join(', ')}` : raw)
    } finally {
      setAiBusy(false)
    }
  }, [assist, content])

  // AI: Extract action items (plain text)
  const aiActionItems = useCallback(async () => {
    if (!content) return
    setAiBusy(true)
    setAiOutput('')
    try {
      const prompt = 'Extract actionable items from the note as a short bullet list.'
      const res = await assist({ mode: 'summarize', prompt, context: content.slice(0, 4000), maxTokens: 160, temperature: 0.2 })
      setAiOutput(res?.text || '')
    } finally {
      setAiBusy(false)
    }
  }, [assist, content])

  // Enhanced AI functions with progress dialogs
  const aiSummarizeWithProgress = useCallback(async (textToSummarize?: string) => {
    const text = textToSummarize || selectedText || content
    if (!text) return

    setProgressDialog({
      isOpen: true,
      title: 'AI Summary',
      message: 'Generating intelligent summary...',
      progress: undefined
    })

    try {
      const response = await generateSummary({ content: text, maxLength: 150 })
      setAiOutput(response.summary)
      // Persist summary locally (per note)
      if (note?.id) {
        try {
          const key = `note:summary:${note.id}`
          const payload = { summary: response.summary, at: new Date().toISOString() }
          localStorage.setItem(key, JSON.stringify(payload))
          setSavedSummary(response.summary)
          setSavedSummaryAt(payload.at)
        } catch {/* ignore */}
      }
      setProgressDialog(prev => ({ ...prev, isOpen: false }))
    } catch (error) {
      console.error('Summary generation failed:', error)
      setProgressDialog(prev => ({ ...prev, isOpen: false }))
      setError('Failed to generate summary')
    }
  }, [generateSummary, selectedText, content])

  const aiClassifyWithProgress = useCallback(async (textToClassify?: string) => {
    const text = textToClassify || selectedText || content
    if (!text) return

    setProgressDialog({
      isOpen: true,
      title: 'AI Classification',
      message: 'Analyzing content and extracting insights...',
      progress: undefined
    })

    try {
      const response = await classifyContent({ content: text })
      setAiOutput(`Classification Results:
Tags: ${response.tags.join(', ')}
Sensitivity: ${response.sensitivity}/10 (${Math.round(response.sensitivityScore * 100)}% confidence)
Summary: ${response.summary}`)
      
      // If we have tag suggestions, show them
      if (response.tags.length > 0) {
        setTagSuggestions(response.tags)
      }
      
      setProgressDialog(prev => ({ ...prev, isOpen: false }))
    } catch (error) {
      console.error('Classification failed:', error)
      setProgressDialog(prev => ({ ...prev, isOpen: false }))
      setError('Failed to classify content')
    }
  }, [classifyContent, selectedText, content])

  // Handle text selection
  const handleTextSelection = useCallback((selectedText: string) => {
    setSelectedText(selectedText)
  }, [])

  // Load cached summary on note change
  useEffect(() => {
    if (!note?.id) { setSavedSummary(''); setSavedSummaryAt(''); return }
    try {
      const raw = localStorage.getItem(`note:summary:${note.id}`)
      if (raw) {
        const obj = JSON.parse(raw)
        setSavedSummary(obj?.summary || '')
        setSavedSummaryAt(obj?.at || '')
      } else {
        setSavedSummary('')
        setSavedSummaryAt('')
      }
    } catch { /* ignore */ }
  }, [note?.id])

  // Copy content to clipboard
  const copyToClipboard = useCallback(async (text?: string) => {
    const textToCopy = text || selectedText || content || title
    if (!textToCopy) return

    try {
      await navigator.clipboard.writeText(textToCopy)
      // Show brief success indicator
      const originalOutput = aiOutput
      setAiOutput('✓ Copied to clipboard!')
      setTimeout(() => setAiOutput(originalOutput), 2000)
    } catch (error) {
      console.error('Copy failed:', error)
      setError('Failed to copy text')
    }
  }, [selectedText, content, title, aiOutput])

  const formatDate = (timestamp?: string) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!isVisible) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="h-full flex flex-col bg-white dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Back to workspace"
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
          
          <div className="flex items-center gap-2">
            <DocumentTextIcon className="w-5 h-5 text-gray-500 dark:text-slate-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
              {loading ? 'Loading...' : note ? 'Note Editor' : 'No Note Selected'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <span className="text-xs text-orange-600 dark:text-orange-400">
              Unsaved changes
            </span>
          )}
          {saving && (
            <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
              Saving...
            </span>
          )}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`p-2 rounded-lg transition-colors ${
              isEditing
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400'
            }`}
            aria-label={isEditing ? 'Switch to preview' : 'Switch to edit'}
          >
            {isEditing ? <EyeIcon className="w-5 h-5" /> : <PencilIcon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
              <p className="text-gray-500 dark:text-slate-400">Loading note...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-red-600 dark:text-red-400">
              <p>{error}</p>
              <button
                onClick={() => noteId && loadNote(noteId)}
                className="mt-2 px-4 py-2 bg-red-100 dark:bg-red-900/30 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !note ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500 dark:text-slate-400">
              <DocumentTextIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Select a note from the workspace to start editing</p>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Note meta info */}
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <input
                  ref={titleRef}
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="text-lg font-semibold bg-transparent border-none outline-none text-gray-900 dark:text-white flex-1 mr-4"
                  placeholder="Untitled Note"
                  disabled={!isEditing}
                />
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3" />
                    {formatDate(note.lastModified)}
                  </span>
                </div>
              </div>
              
              {note.tags && note.tags.length > 0 && (
                <div className="flex items-center gap-2">
                  <TagIcon className="w-3 h-3 text-gray-400 dark:text-slate-500" />
                  <div className="flex flex-wrap gap-1 items-center">
                    {note.tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[11px] rounded-full">
                        {tag}
                        <button className="text-purple-700/70 hover:text-purple-900" title="Remove" onClick={() => removeTag(tag)}>×</button>
                      </span>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                      placeholder="Add tag"
                      className="px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900"
                    />
                    <button className="text-[11px] px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded" onClick={addTag}>Add</button>
                    {tagInput && allTags.length > 0 && (
                      <div className="absolute mt-8 z-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded shadow max-h-40 overflow-auto text-xs">
                        {allTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase())).slice(0, 8).map(t => (
                          <button key={t} className="block w-full text-left px-2 py-1 hover:bg-gray-100 dark:hover:bg-slate-800" onClick={() => { setTagInput(t); setTimeout(addTag, 0) }}>{t}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Editor area */}
            <div className="flex-1 overflow-hidden">
              {isEditing ? (
                <div className="h-full overflow-y-auto p-2">
                  <NoteEditorAI
                    initialContent={content}
                    onChange={(t) => handleContentChange(t)}
                    onSave={() => saveNote(true)}
                    onSelect={handleTextSelection}
                  />
                </div>
              ) : (
                <div className="h-full overflow-y-auto p-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {content ? (
                      <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                        {content}
                      </pre>
                    ) : (
                      <p className="text-gray-500 dark:text-slate-400 italic">
                        This note is empty. Click the edit button to add content.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          <div className="flex items-center gap-4">
            {note && (
              <>
                <span>{content.length} characters</span>
                <span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span>
                <span>{content.split('\n').length} lines</span>
                {lastSavedAt && (
                  <span title={new Date(lastSavedAt).toLocaleString()}>
                    Saved {formatRelativeTime(lastSavedAt)}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditing && (
              <span className="text-purple-600 dark:text-purple-400">
                Editing • Ctrl+S to save
              </span>
            )}
            
            {/* Enhanced toolbar with copy button and better AI features */}
            <button
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              onClick={() => copyToClipboard()}
              title="Copy content to clipboard"
            >
              <ClipboardDocumentIcon className="w-4 h-4" />
              Copy
            </button>
            
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 disabled:opacity-50 transition-colors"
            onClick={() => aiSummarizeWithProgress()}
            disabled={aiBusy || progressDialog.isOpen}
            title={selectedText ? 'Summarize selected text' : 'Summarize content'}
          >
            <SparklesIcon className="w-4 h-4" />
            {selectedText ? 'Summarize Selection' : 'AI Summary'}
          </button>

          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 disabled:opacity-50 transition-colors"
            onClick={() => aiClassifyWithProgress()}
            disabled={aiBusy || progressDialog.isOpen}
            title={selectedText ? 'Classify selected text' : 'Classify content'}
          >
            <TagIcon className="w-4 h-4" />
            {selectedText ? 'Classify Selection' : 'Classify'}
          </button>

          {/* Auto-tag: classify and apply tags */}
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 disabled:opacity-50 transition-colors"
            onClick={async () => {
              if (!note) return
              try {
                setProgressDialog({ isOpen: true, title: 'Auto-tagging', message: 'Classifying note and applying tags…', progress: 0 })
                const res: any = await classifyNote(note.id)
                let tags: string[] = Array.isArray(res?.tags) ? res.tags : []
                // Fallback: lightweight keyword tags if AI returned none
                if (tags.length === 0) {
                  const fallback = (text: string) => {
                    const stop = new Set(['the','a','an','and','or','for','of','to','in','on','with','by','from','is','are','was','were'])
                    const words = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length >= 3 && !stop.has(w))
                    const freq: Record<string, number> = {}
                    for (const w of words) freq[w] = (freq[w] || 0) + 1
                    return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([w])=>w)
                  }
                  tags = fallback(content)
                }
                if (tags.length > 0) {
                  await tagsApi.addToNote(note.id, tags)
                  await refreshNoteTags(note.id)
                }
                setProgressDialog({ isOpen: false, title: '', message: '' })
              } catch (e) {
                setProgressDialog({ isOpen: false, title: '', message: '' })
                console.error('Auto-tag failed', e)
              }
            }}
            disabled={!note || saving || loading}
            title="Auto-generate and apply tags"
          >
            <TagIcon className="w-4 h-4" />
            Auto Tag
          </button>

          {/* Remove empty lines */}
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 disabled:opacity-50 transition-colors"
            onClick={() => {
              const beforeLines = (content || '').split('\n').length
              const cleaned = (content || '')
                .split('\n')
                .reduce<string[]>((acc, line) => {
                  const trimmed = line.trim()
                  if (trimmed.length === 0) {
                    if (acc.length > 0 && acc[acc.length - 1] !== '') acc.push('')
                  } else {
                    acc.push(line)
                  }
                  return acc
                }, [])
                .join('\n')
                .replace(/\n{3,}/g, '\n\n')
              setContent(cleaned)
              setHasUnsavedChanges(true)
              const afterLines = cleaned.split('\n').length
              const diff = Math.max(0, beforeLines - afterLines)
              setToast(`Cleaned ${diff} line${diff === 1 ? '' : 's'}`)
              setTimeout(() => setToast(''), 2000)
            }}
            disabled={!note}
            title="Remove empty lines"
          >
            <ScissorsIcon className="w-4 h-4" />
            Clean Lines
          </button>

          {/* Rebuild Graph */}
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 disabled:opacity-50 transition-colors"
            onClick={async () => {
              try {
                setProgressDialog({ isOpen: true, title: 'Rebuilding Graph', message: 'Running entity extraction and relationship discovery…', progress: undefined })
                await rebuildGraph()
                setProgressDialog({ isOpen: false, title: '', message: '' })
              } catch (e) {
                setProgressDialog({ isOpen: false, title: '', message: '' })
                console.error('Graph rebuild failed', e)
              }
            }}
            disabled={loading}
            title="Rebuild knowledge graph"
          >
            <BoltIcon className="w-4 h-4" />
            Rebuild Graph
          </button>
            
            <button
              className={`px-2 py-1 rounded transition-colors ${showRecent ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
              onClick={async () => { const next = !showRecent; setShowRecent(next); if (next) await loadRecent() }}
            >Recent</button>

            <button
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 disabled:opacity-50 transition-colors"
              onClick={handleDeleteNote}
              disabled={loading || saving}
              title="Delete this note"
            >
              <TrashIcon className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
        {aiOutput && (
        <div className="mt-2 p-2 rounded bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-gray-200">
          <div className="flex items-center justify-between mb-1">
            <div className="font-medium">AI Output</div>
            {savedSummaryAt && (
              <div className="text-[10px] text-gray-500">Saved {formatRelativeTime(savedSummaryAt)}</div>
            )}
          </div>
          <div className="whitespace-pre-wrap text-xs max-h-56 overflow-auto">{aiOutput || savedSummary}</div>
          {savedSummary && !aiOutput && (
            <div className="mt-1 text-[10px] text-gray-500">Showing last saved summary (no new output)</div>
          )}
          {Array.isArray(tagSuggestions) && (
            <div className="mt-2 flex items-center gap-2">
              <button
                className="px-2 py-1 rounded bg-emerald-600 text-white text-xs"
                onClick={async () => {
                    if (!note || !tagSuggestions?.length) return
                    await tagsApi.addToNote(note.id, tagSuggestions)
                    const fresh = await tagsApi.getForNote(note.id)
                    const tags: string[] = fresh?.tags ?? fresh?.Tags ?? []
                    setNote(prev => prev ? { ...prev, tags } : prev)
                    setTagSuggestions(null)
                  }}
                >Apply Tags</button>
                <button className="px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 text-xs" onClick={() => setTagSuggestions(null)}>Dismiss</button>
              </div>
            )}
          </div>
        )}
        {/* Selection toolbar */}
        {selectedText && (
          <div className="mt-2 p-2 border border-dashed border-purple-300 rounded bg-purple-50 dark:bg-purple-900/10 text-[11px] text-purple-800 dark:text-purple-200 flex items-center gap-2">
            <span className="truncate">Selection: “{selectedText.slice(0, 60)}{selectedText.length > 60 ? '…' : ''}”</span>
            <button className="px-2 py-0.5 rounded bg-purple-600 text-white" onClick={() => aiSummarizeWithProgress(selectedText)}>Summarize</button>
            <button className="px-2 py-0.5 rounded bg-purple-600 text-white" onClick={() => aiClassifyWithProgress(selectedText)}>Classify</button>
            <button className="px-2 py-0.5 rounded bg-gray-200 dark:bg-slate-700" onClick={() => setSelectedText('')}>Clear</button>
          </div>
        )}
        {showRecent && (
          <div className="mt-2 p-2 rounded bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700">
            <div className="font-medium text-xs mb-1 text-gray-700 dark:text-gray-300">Recent Notes</div>
            <div className="max-h-40 overflow-auto divide-y divide-gray-100 dark:divide-slate-700">
              {recentNotes.length === 0 ? (
                <div className="text-xs text-gray-500">No recent items.</div>
              ) : recentNotes.map(n => (
                <button key={n.id} className="w-full text-left py-1.5 text-xs px-1 hover:bg-gray-50 dark:hover:bg-slate-800 rounded"
                  onClick={() => openRecent(n.id)}
                  title={n.title}
                >
                  <div className="truncate text-gray-800 dark:text-gray-200">{n.title}</div>
                  <div 
                    className="text-[10px] text-gray-500"
                    title={n.updatedAt ? new Date(n.updatedAt).toLocaleString() : ''}
                  >
                    {n.updatedAt ? formatRelativeTime(n.updatedAt) : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Progress Dialog for AI operations */}
      <ProgressDialog
        isOpen={progressDialog.isOpen}
        onClose={() => setProgressDialog(prev => ({ ...prev, isOpen: false }))}
        title={progressDialog.title}
        message={progressDialog.message}
        progress={progressDialog.progress}
        canCancel={true}
      />

      {toast && (
        <div className="fixed bottom-4 right-4 px-3 py-2 rounded bg-black/80 text-white text-xs shadow-lg">
          {toast}
        </div>
      )}

      {/* Deletion confirmation dialog */}
      <DeletionPlanDialog
        isOpen={deletionDialog.isOpen}
        onClose={() => setDeletionDialog({ isOpen: false, noteId: null, noteTitle: null })}
        onConfirm={confirmDeleteNote}
        noteId={deletionDialog.noteId || ''}
        getDeletionPlan={getDeletionPlan}
      />
    </motion.div>
  )
}
