'use client'

import { ReactNode, createContext, useContext } from 'react'

interface DevAuthContextType {
  isAuthenticated: boolean
  user: { name: string; email: string } | null
  login: () => Promise<void>
  logout: () => void
  getAccessToken: () => Promise<string | null>
  loading: boolean
}

const DevAuthContext = createContext<DevAuthContextType | undefined>(undefined)

interface DevAuthWrapperProps {
  children: ReactNode
}

export function DevAuthWrapper({ children }: DevAuthWrapperProps) {
  // Mock authentication for development
  const mockAuth: DevAuthContextType = {
    isAuthenticated: true,
    user: { name: 'Dev User', email: 'dev@cortex.local' },
    login: async () => {},
    logout: () => {},
    getAccessToken: async () => 'dev-mock-token',
    loading: false
  }

  return (
    <DevAuthContext.Provider value={mockAuth}>
      {children}
    </DevAuthContext.Provider>
  )
}

export function useDevAuth(): DevAuthContextType {
  const context = useContext(DevAuthContext)
  if (context === undefined) {
    throw new Error('useDevAuth must be used within a DevAuthWrapper')
  }
  return context
}
