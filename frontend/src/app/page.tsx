'use client'

import React, { useState, useEffect } from 'react'
import { useCortexStore } from '../store/cortexStore'
import { useAuth } from '../contexts/AuthContext'
import { useNotesApi } from '../services/apiClient'
import ModernLayout from '../components/layout/ModernLayout'
import ModernDashboard from '../components/dashboard/ModernDashboard'
import ModernChatInterface from '../components/chat/ModernChatInterface'
import KnowledgeGraphVisualizer from '../components/graph/KnowledgeGraphVisualizer'
import EnhancedSearchPage from '../components/EnhancedSearchPage'
import { UserProfile } from '../components/UserProfile'

export default function Home() {
  const [activeView, setActiveView] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { notes, searchResults } = useCortexStore()
  const { isAuthenticated, user } = useAuth()
  const notesApi = useNotesApi()
  const [isLoading, setIsLoading] = useState(true)

  // Load initial data when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      loadInitialData()
    }
  }, [isAuthenticated, user])

  const loadInitialData = async () => {
    try {
      setIsLoading(true)
      // Load user's notes
      const userNotes = await notesApi.getNotes()
      
      // If user has no notes, create seed data
      if (userNotes.length === 0) {
        console.log('Creating seed data for new user...')
        await notesApi.createSeedData()
        // Reload notes after seed data creation
        await notesApi.getNotes()
      }
    } catch (error) {
      console.error('Failed to load initial data:', error)
    } finally {
      setIsLoading(false)
    }
  }

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
        return <ModernChatInterface />
      
      case 'search':
        return <EnhancedSearchPage onNoteSelect={() => {}} />
      
      case 'documents':
        return (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Document Management</h2>
              <p className="text-slate-600 dark:text-slate-400">Upload and manage your documents here</p>
            </div>
          </div>
        )
      
      case 'graph':
        return <KnowledgeGraphVisualizer />
      
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
      >
        {renderActiveView()}
      </ModernLayout>
    </div>
  )
}
