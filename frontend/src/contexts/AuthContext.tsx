'use client'

import { createContext, useContext, ReactNode, useEffect, useState } from 'react'
import { 
  PublicClientApplication, 
  AccountInfo, 
  InteractionRequiredAuthError,
  AuthenticationResult
} from '@azure/msal-browser'
import { msalConfig, loginRequest, tokenRequest } from '../config/authConfig'

// Create MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig)

interface AuthContextType {
  isAuthenticated: boolean
  user: AccountInfo | null
  login: () => Promise<void>
  logout: () => Promise<void>
  getAccessToken: () => Promise<string | null>
  loading: boolean
  recentAuthEvent: 'signup' | 'login' | null
  clearRecentAuthEvent: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<AccountInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentAuthEvent, setRecentAuthEvent] = useState<'signup' | 'login' | null>(null)

  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

  // Local authed fetch that does NOT depend on useAuth to avoid circular deps
  const authedFetch = async (path: string, init?: RequestInit, tokenOverride?: string | null) => {
    let token = tokenOverride ?? null
    if (!token) {
      token = await getAccessToken()
    }
    const headers = new Headers(init?.headers || {})
    if (!headers.has('Content-Type') && init?.body) headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(`${baseUrl}${path}`, { ...(init || {}), headers })
    return res
  }

  useEffect(() => {
    const initializeAuth = async () => {
      await msalInstance.initialize()
      
      // Handle redirect response
      const response = await msalInstance.handleRedirectPromise()
      
      if (response && response.account) {
        setUser(response.account)
        setIsAuthenticated(true)
        
        // Create or get user profile and trigger seed data creation
        const created = await handleUserProfile(response.account, response.accessToken)
        setRecentAuthEvent(created ? 'signup' : 'login')
      } else {
        // Check for existing accounts
        const accounts = msalInstance.getAllAccounts()
        if (accounts.length > 0) {
          setUser(accounts[0])
          setIsAuthenticated(true)
        }
      }
      
      setLoading(false)
    }

    initializeAuth()
  }, [])

  const login = async () => {
    try {
      setLoading(true)
      
      // Debug: Log the current configuration
      console.log('MSAL Config being used:', {
        clientId: msalConfig.auth.clientId,
        authority: msalConfig.auth.authority,
        redirectUri: msalConfig.auth.redirectUri,
        currentUrl: window.location.href
      })
      
      // Use redirect instead of popup
      await msalInstance.loginRedirect(loginRequest)
      
    } catch (error) {
      console.error('Login failed:', error)
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      setLoading(true)
      await msalInstance.logoutRedirect({
        postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri
      })
    } catch (error) {
      console.error('Logout failed:', error)
      setLoading(false)
    }
  }

  const getAccessToken = async (): Promise<string | null> => {
    const accounts = msalInstance.getAllAccounts()
    if (accounts.length === 0) {
      return null
    }

    const request = {
      ...tokenRequest,
      account: accounts[0]
    }

    try {
      const response = await msalInstance.acquireTokenSilent(request)
      return response.accessToken
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Fallback to interactive token acquisition
        try {
          const response = await msalInstance.acquireTokenPopup(request)
          return response.accessToken
        } catch (interactiveError) {
          console.error('Interactive token acquisition failed:', interactiveError)
          return null
        }
      } else {
        console.error('Silent token acquisition failed:', error)
        return null
      }
    }
  }

  const createSeedDataIfNeeded = async (accessToken: string | null) => {
    try {
      // Check notes count
      const notesRes = await authedFetch('/api/Notes', undefined, accessToken)
      if (!notesRes.ok) throw new Error(`Notes fetch failed: ${notesRes.status}`)
      const notes = await notesRes.json()
      if (!Array.isArray(notes) || notes.length === 0) {
        const seedRes = await authedFetch('/api/seed-data', { method: 'POST' }, accessToken)
        if (!seedRes.ok) throw new Error(`Seed failed: ${seedRes.status}`)
      }
    } catch (error) {
      console.error('Failed to create seed data:', error)
    }
  }

  const handleUserProfile = async (account: AccountInfo, accessToken: string) => {
    try {
      // First, try to get existing user profile
      let existing: any | null = null
      try {
        const res = await authedFetch('/api/User/profile', undefined, accessToken)
        if (res.ok) existing = await res.json()
      } catch {}

      if (!existing) {
        // User profile doesn't exist, create it
        console.log('Creating new user profile...')
        try {
          const res = await authedFetch('/api/User/profile', {
            method: 'POST',
            body: JSON.stringify({
              email: account.username || account.localAccountId,
              name: account.name || 'User',
              subjectId: account.localAccountId || account.homeAccountId
            })
          }, accessToken)
          if (!res.ok) throw new Error(`Create profile failed: ${res.status}`)
          console.log('User profile created successfully')
          // Create seed data for new user
          await createSeedDataIfNeeded(accessToken)
          return true // created new profile
        } catch {
          console.error('Failed to create user profile')
        }
      } else {
        // User profile exists, check for seed data
        console.log('User profile found, checking for existing data...')
        await createSeedDataIfNeeded(accessToken)
        return false // existing profile
      }
    } catch (error) {
      console.error('Error handling user profile:', error)
      // Still try to create seed data even if profile handling fails
      await createSeedDataIfNeeded(accessToken)
    }
    return false
  }

  const value: AuthContextType = {
    isAuthenticated,
    user,
    login,
    logout,
    getAccessToken,
  loading,
  recentAuthEvent,
  clearRecentAuthEvent: () => setRecentAuthEvent(null)
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
