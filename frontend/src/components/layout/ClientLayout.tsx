'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useCortexStore } from '@/store/cortexStore'
import { useAuth } from '@/contexts/AuthContext'
import { useNotesApi } from '@/services/apiClient'
import ModernLayout from '@/components/layout/ModernLayout'

interface ClientLayoutProps {
  children: React.ReactNode
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isAuthenticated, user } = useAuth()
  const notesApi = useNotesApi()

  // Get current view from pathname
  const getCurrentView = useCallback(() => {
    if (pathname === '/') return 'search'
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 0) return 'search'
    
    // Map some routes
    const routeMap: Record<string, string> = {
      'notes': 'notes-browser',
      'graph': 'graph',
      'config': 'config'
    }
    
    return routeMap[segments[0]] || segments[0]
  }, [pathname])

  // Navigation handler that uses router
  const handleViewChange = useCallback((view: string) => {
    // Map views to routes
    const viewToRoute: Record<string, string> = {
      'dashboard': '/dashboard',
      'search': '/search',
      'advanced-search': '/search',
      'chat': '/chat',
      'workspace': '/workspace',
      'workflow': '/workflow',
      'ingest': '/ingest',
      'notes': '/notes',
      'notes-browser': '/notes',
      'documents': '/documents',
      'graph': '/graph',
      'analytics': '/analytics',
      'achievements': '/achievements',
      'settings': '/settings',
      'jobs': '/jobs',
      'system': '/system',
      'config': '/config'
    }
    
    const route = viewToRoute[view] || `/${view}`
    router.push(route)
  }, [router])

  // Load initial data when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      notesApi.getNotes().catch(console.error)
    }
  }, [isAuthenticated, user, notesApi])

  return (
    <div className="h-screen overflow-hidden bg-white dark:bg-slate-950 transition-colors duration-300">
      <ModernLayout
        activeView={getCurrentView()}
        onViewChange={handleViewChange}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      >
        {children}
      </ModernLayout>
    </div>
  )
}
