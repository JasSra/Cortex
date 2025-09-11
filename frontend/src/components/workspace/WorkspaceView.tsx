'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bars3Icon,
  FolderIcon
} from '@heroicons/react/24/outline'
import WorkspaceSidebar from './WorkspaceSidebar'
import WorkspaceEditor from './WorkspaceEditor'
import { useWorkspaceApi, useIngestApi } from '../../services/apiClient'

export default function WorkspaceView() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const { getWorkspace } = useWorkspaceApi()
  const { createNote } = useIngestApi()

  // Load workspace state on mount
  const loadWorkspace = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const workspace = await getWorkspace()
      
      // Restore active note if available
      if (workspace?.activeNoteId) {
        setSelectedNoteId(workspace.activeNoteId)
      }
      
    } catch (e: any) {
      console.error('Failed to load workspace:', e)
      setError(e?.message || 'Failed to load workspace')
    } finally {
      setLoading(false)
    }
  }, [getWorkspace])

  useEffect(() => {
    loadWorkspace()
  }, [loadWorkspace])

  const handleNoteSelect = useCallback((noteId: string) => {
    setSelectedNoteId(noteId)
    // Auto-close sidebar on mobile after selecting note
    if (window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }, [])

  const handleBackToWorkspace = useCallback(() => {
    setSelectedNoteId(null)
    setSidebarOpen(true)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const handleCreatePlainNote = useCallback(async () => {
    if (creating) return
    try {
      setCreating(true)
      // Backend will handle empty content by providing default placeholder
      const created = await createNote('', 'Untitled Note')
      const newId = created?.noteId
      if (newId) {
        setSelectedNoteId(String(newId))
        // Ensure editor area is visible on mobile
        if (window.innerWidth < 1024) setSidebarOpen(false)
      }
    } catch (e) {
      console.error('Failed to create note:', e)
      setError((e as any)?.message || 'Failed to create note')
    } finally {
      setCreating(false)
    }
  }, [createNote, creating])

  return (
    <div className="h-full flex bg-gray-50 dark:bg-slate-900">
      {/* Workspace Sidebar */}
      <WorkspaceSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNoteSelect={handleNoteSelect}
        selectedNoteId={selectedNoteId || undefined}
  onCreateNote={handleCreatePlainNote}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors lg:hidden"
              aria-label="Toggle workspace sidebar"
            >
              <Bars3Icon className="w-5 h-5 text-gray-500 dark:text-slate-400" />
            </button>
            
            <div className="flex items-center gap-2">
              <FolderIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Workspace
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={toggleSidebar}
                className="hidden lg:flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-slate-800 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Bars3Icon className="w-4 h-4" />
                Show Sidebar
              </button>
            )}
            <button
              onClick={handleCreatePlainNote}
              disabled={creating}
              className="hidden lg:inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
            >
              New Note
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-500 dark:text-slate-400">Loading workspace...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FolderIcon className="w-16 h-16 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Failed to Load Workspace
                </h3>
                <p className="text-gray-600 dark:text-slate-400 mb-4">
                  {error}
                </p>
                <button
                  onClick={loadWorkspace}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : selectedNoteId ? (
            <WorkspaceEditor
              noteId={selectedNoteId}
              onBack={handleBackToWorkspace}
              isVisible={true}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <FolderIcon className="w-16 h-16 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Welcome to Your Workspace
                </h3>
                <p className="text-gray-600 dark:text-slate-400 mb-6">
                  Your personal workspace with tag-driven navigation and recent notes. 
                  {!sidebarOpen && ' Open the sidebar to start browsing your notes.'}
                </p>
                
                {!sidebarOpen && (
                  <button
                    onClick={toggleSidebar}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Open Workspace Sidebar
                  </button>
                )}
                
                <div className="mt-8 text-left bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                    Workspace Features:
                  </h4>
                  <ul className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
                    <li>• Tag-driven note organization</li>
                    <li>• Recent notes quick access</li>
                    <li>• Editor state persistence (cursor position, scroll)</li>
                    <li>• Auto-save with Ctrl+S shortcuts</li>
                    <li>• VS Code-like editing experience</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
