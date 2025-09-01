'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useCortexStore } from '@/store/cortexStore'
import { useAuth } from '@/contexts/AuthContext'
import { useNotesApi } from '@/services/apiClient'
import ModernLayout from '@/components/layout/ModernLayout'
import ModernDashboard from '@/components/dashboard/ModernDashboard'
import SmartLiveAssistant from '@/components/assistant/SmartLiveAssistant'
import KnowledgeGraphVisualizer from '@/components/graph/KnowledgeGraphVisualizer'
import NotesBrowserPage from '@/components/pages/NotesBrowserPage'
import AdvancedSearchPage from '@/components/pages/AdvancedSearchPage'
import DocumentsPage from '@/components/pages/DocumentsPage'
import ConfigurationPage from './config/page'
import { UserProfile } from '@/components/UserProfile'

export default function Home() {
  // Default landing is Search; sidebar starts collapsed
  const [activeView, setActiveView] = useState('search')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { notes, searchResults } = useCortexStore()
  const { isAuthenticated, user } = useAuth()
  const notesApi = useNotesApi()
  const [isLoading, setIsLoading] = useState(false)

  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true)
      // Load user's notes
      await notesApi.getNotes()
    } catch (error) {
      console.error('Failed to load initial data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [notesApi])

  // Load initial data when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      loadInitialData()
    } else {
      // Don't block the UI when not authenticated
      setIsLoading(false)
    }
  }, [isAuthenticated, user, loadInitialData])

  // Expose a minimal navigation bridge for components rendered deep (WelcomePage)
  useEffect(() => {
    ;(window as any).__setActiveView = (v: string) => setActiveView(v)
    return () => { delete (window as any).__setActiveView }
  }, [])

  const renderActiveView = () => {
    if (isLoading) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 shadow-lg">
              <svg className="animate-spin w-6 h-6 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Loading Your Workspace</h2>
            <p className="text-slate-600 dark:text-slate-400">Setting up your personal knowledge hub...</p>
          </div>
        </div>
      )
    }

    switch (activeView) {
      case 'dashboard':
      case 'analytics':
        return <ModernDashboard />
      
      case 'chat':
        return <SmartLiveAssistant />
      
      case 'search':
      case 'advanced-search':
        return <AdvancedSearchPage />
      
      case 'notes':
      case 'notes-browser':
        return <NotesBrowserPage />
      
      case 'documents':
        return <DocumentsPage />
      
      case 'graph':
        return <KnowledgeGraphVisualizer />
      
      case 'config':
      case 'configuration':
        return <ConfigurationPage />
      
      case 'settings':
        return (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Settings</h2>
              <p className="text-slate-600 dark:text-slate-400">Configure your Cortex preferences</p>
              <div className="mt-8 max-w-md mx-auto">
                <UserProfile />
              </div>
            </div>
          </div>
        )
      
      default:
        return <ModernDashboard />
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-white dark:bg-slate-950 transition-colors duration-300">
      <ModernLayout
        activeView={activeView}
        onViewChange={setActiveView}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      />
    </div>
  )
}
