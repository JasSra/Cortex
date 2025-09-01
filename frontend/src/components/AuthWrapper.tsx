'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppAuth } from '@/hooks/useAppAuth'
import { LoginPage } from './LoginPage'
import WelcomeDialog from './WelcomeDialog'
import ConnectivityBackdrop from './ConnectivityBackdrop'

interface AuthWrapperProps {
  children: ReactNode
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { isAuthenticated, loading, recentAuthEvent, clearRecentAuthEvent } = useAuth()
  const [showWelcome, setShowWelcome] = useState(false)
  const [welcomeType, setWelcomeType] = useState<'signup' | 'login'>('login')

  useEffect(() => {
    if (recentAuthEvent) {
      setWelcomeType(recentAuthEvent)
      setShowWelcome(true)
    }
  }, [recentAuthEvent])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 dark:from-slate-950 dark:via-purple-950 dark:to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 shadow-2xl shadow-purple-500/25">
            <svg className="animate-spin w-8 h-8 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Loading Cortex</h2>
          <p className="text-slate-300">Please wait while we initialize your workspace...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <>
      {children}
      <ConnectivityBackdrop />
      <WelcomeDialog 
        open={showWelcome} 
        type={welcomeType}
        onClose={() => setShowWelcome(false)} 
      />
    </>
  )
}
