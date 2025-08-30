'use client'

import React from 'react'
import ChatAssistantPage from './pages/ChatAssistantPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import IngestPage from './pages/IngestPage'
import AchievementsPanel from './gamification/AchievementsPanel'
import WelcomePage from './pages/WelcomePage'
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
      return (
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-4">Dashboard</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">Welcome to Cortex</h3>
              <p className="text-gray-600 dark:text-slate-400">Your AI-powered knowledge management system</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">Quick Actions</h3>
              <p className="text-gray-600 dark:text-slate-400">Upload documents, search, or start a chat</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">Recent Activity</h3>
              <p className="text-gray-600 dark:text-slate-400">View your latest documents and searches</p>
            </div>
          </div>
        </div>
      )
    case 'search':
      return (
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-4">Search</h1>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
            <p className="text-gray-600 dark:text-slate-400">Search functionality will be implemented here</p>
          </div>
        </div>
      )
    case 'chat':
  return <ChatAssistantPage />
    case 'documents':
      return (
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-4">Documents</h1>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
            <p className="text-gray-600 dark:text-slate-400">Document management will be implemented here</p>
          </div>
        </div>
      )
    case 'graph':
      return (
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-4">Knowledge Graph</h1>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
            <p className="text-gray-600 dark:text-slate-400">Knowledge graph visualization will be implemented here</p>
          </div>
        </div>
      )
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
