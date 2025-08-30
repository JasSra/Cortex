'use client'

import React from 'react'
import ChatAssistantPage from './pages/ChatAssistantPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import IngestPage from './pages/IngestPage'
import AchievementsPanel from './gamification/AchievementsPanel'
import WelcomePage from './pages/WelcomePage'
import NotesBrowserPage from './pages/NotesBrowserPage'
import AdvancedSearchPage from './pages/AdvancedSearchPage'
import ModernDashboard from './dashboard/ModernDashboard'
import DocumentsPage from './pages/DocumentsPage'
import KnowledgeGraphPage from './pages/KnowledgeGraphPage'
import { useAuth } from '@/contexts/AuthContext'

interface PageRendererProps {
  activeView: string
}

const PageRenderer: React.FC<PageRendererProps> = ({ activeView }) => {
  const { recentAuthEvent } = useAuth()
  if (recentAuthEvent && (activeView === 'dashboard' || activeView === 'analytics')) {
    // Show Welcome immediately after fresh login/signup
    return <WelcomePage onNavigate={(v) => { (window as any).__setActiveView?.(v) }} />
  }
  switch (activeView) {
    case 'analytics':
      return <AnalyticsPage />
    case 'achievements':
      return <AchievementsPanel />
    case 'settings':
      return <SettingsPage />
    case 'ingest':
      return <IngestPage />
    case 'dashboard':
      return <ModernDashboard />
    case 'search':
    case 'advanced-search':
      return <AdvancedSearchPage />
    case 'notes':
    case 'notes-browser':
      return <NotesBrowserPage />
    case 'chat':
      return <ChatAssistantPage />
    case 'documents':
      return <DocumentsPage />
    case 'graph':
      return <KnowledgeGraphPage />
    default:
      return (
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-4">Page Not Found</h1>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
            <p className="text-gray-600 dark:text-slate-400">The requested page could not be found.</p>
          </div>
        </div>
      )
  }
}

export default PageRenderer
