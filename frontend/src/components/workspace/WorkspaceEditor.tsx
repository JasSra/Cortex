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
  ArrowLeftIcon
} from '@heroicons/react/24/outline'
import { useWorkspaceApi, useNotesApi } from '../../services/apiClient'

interface WorkspaceEditorProps {
  noteId: string | null
  onBack: () => void
  isVisible: boolean
}

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  lastModified: string
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
  const { getNote, updateNote } = useNotesApi()

  // Load note data
  const loadNote = useCallback(async (id: string) => {
    try {
      setLoading(true)
      setError(null)
      
      const noteData = await getNote(id)
      setNote(noteData)
      setContent(noteData.content || '')
      setTitle(noteData.title || '')
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

      await updateNote(note.id, content, title.trim() || 'Untitled Note')
      
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

  const formatDate = (timestamp: string) => {
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
                  <div className="flex flex-wrap gap-1">
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Editor area */}
            <div className="flex-1 overflow-hidden">
              {isEditing ? (
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full h-full p-4 bg-white dark:bg-slate-900 text-gray-900 dark:text-white border-none outline-none resize-none font-mono text-sm leading-relaxed"
                  placeholder="Start writing your note..."
                  spellCheck={false}
                />
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
                <span>{content.split('\n').length} lines</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditing && (
              <span className="text-purple-600 dark:text-purple-400">
                Editing • Ctrl+S to save
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
