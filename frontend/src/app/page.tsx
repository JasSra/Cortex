'use client'

import React, { useState } from 'react'
import { useCortexStore } from '../store/cortexStore'
import ModernLayout from '../components/layout/ModernLayout'
import ModernDashboard from '../components/dashboard/ModernDashboard'
import ModernChatInterface from '../components/chat/ModernChatInterface'
import KnowledgeGraphVisualizer from '../components/graph/KnowledgeGraphVisualizer'
import EnhancedSearchPage from '../components/EnhancedSearchPage'

export default function Home() {
  const [activeView, setActiveView] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { notes, searchResults } = useCortexStore()

  const renderActiveView = () => {
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
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Document Management</h2>
              <p className="text-gray-600">Upload and manage your documents here</p>
            </div>
          </div>
        )
      
      case 'graph':
        return <KnowledgeGraphVisualizer />
      
      case 'settings':
        return (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Settings</h2>
              <p className="text-gray-600">Configure your Cortex preferences</p>
            </div>
          </div>
        )
      
      default:
        return <ModernDashboard />
    }
  }

  return (
    <div className="h-screen overflow-hidden">
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
