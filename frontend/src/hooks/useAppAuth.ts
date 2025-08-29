'use client'

import { useAuth } from '@/contexts/AuthContext'

const isDevelopment = process.env.NEXT_PUBLIC_DEV_MODE === 'true'

// Mock auth interface for development
interface DevAuth {
  isAuthenticated: boolean
  user: { name: string; email: string } | null
  login: () => Promise<void>
  logout: () => void
  getAccessToken: () => Promise<string | null>
  loading: boolean
}

const mockDevAuth: DevAuth = {
  isAuthenticated: true,
  user: { name: 'Dev User', email: 'dev@cortex.local' },
  login: async () => {},
  logout: () => {},
  getAccessToken: async () => 'dev-mock-token',
  loading: false
}

export function useAppAuth() {
  const prodAuth = isDevelopment ? null : useAuth()
  
  return isDevelopment ? mockDevAuth : prodAuth!
}
