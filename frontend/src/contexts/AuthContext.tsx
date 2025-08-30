'use client'

import { createContext, useContext, ReactNode, useEffect, useState, useCallback } from 'react'
import { 
  PublicClientApplication, 
  AccountInfo, 
  InteractionRequiredAuthError,
  AuthenticationResult
} from '@azure/msal-browser'
import { msalConfig, loginRequest, tokenRequest } from '../config/authConfig'

// Create MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig)

// Helper function to get user display name from B2C claims
export const getUserDisplayName = (user: AccountInfo | null): string => {
  if (!user) return 'User'
  
  // Check for given_name + family_name in idTokenClaims
  const claims = user.idTokenClaims as any
  if (claims) {
    const givenName = claims.given_name || claims.givenName
    const familyName = claims.family_name || claims.surname || claims.familyName
    
    if (givenName && familyName) {
      return `${givenName} ${familyName}`
    }
    if (givenName) {
      return givenName
    }
    if (familyName) {
      return familyName
    }
  }
  
  // Fallback to standard MSAL properties
  return user.name || (user as any).username || user.username || 'User'
}

// Helper function to get user initials from B2C claims
export const getUserInitials = (user: AccountInfo | null): string => {
  if (!user) return 'U'
  
  // Check for given_name + family_name in idTokenClaims
  const claims = user.idTokenClaims as any
  if (claims) {
    const givenName = claims.given_name || claims.givenName
    const familyName = claims.family_name || claims.surname || claims.familyName
    
    if (givenName && familyName) {
      return `${givenName[0]}${familyName[0]}`.toUpperCase()
    }
    if (givenName) {
      return givenName[0].toUpperCase()
    }
    if (familyName) {
      return familyName[0].toUpperCase()
    }
  }
  
  // Fallback to first letter of display name
  const displayName = user.name || (user as any).username || user.username || 'User'
  return displayName[0].toUpperCase()
}

// Helper function to get user email from B2C claims
export const getUserEmail = (user: AccountInfo | null): string => {
  if (!user) return ''
  
  // Check for email in idTokenClaims
  const claims = user.idTokenClaims as any
  if (claims) {
    // Try various email claim names
    const email = claims.email || claims.emails?.[0] || claims.signInName || claims.preferred_username
    if (email && email !== user.localAccountId) {
      return email
    }
  }
  
  // Fallback to username if it looks like an email
  const username = user.username || user.localAccountId || ''
  if (username.includes('@')) {
    return username
  }
  
  return ''
}

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
      try {
        console.log('Starting MSAL initialization...')
        await msalInstance.initialize()
        console.log('MSAL initialized successfully')
        
        // Handle redirect response
        const response = await msalInstance.handleRedirectPromise()
        console.log('Redirect response:', response)
        
        if (response && response.account) {
          console.log('User logged in from redirect:', response.account.username)
          console.log('User claims:', response.account.idTokenClaims)
          setUser(response.account)
          setIsAuthenticated(true)
          
          // Create or get user profile (no automatic seeding) - with timeout
          try {
            const created = await Promise.race([
              handleUserProfile(response.account, response.accessToken),
              new Promise<boolean>((_, reject) => 
                setTimeout(() => reject(new Error('Profile creation timeout')), 5000)
              )
            ])
            setRecentAuthEvent(created ? 'signup' : 'login')
          } catch (error) {
            console.warn('Profile creation failed or timed out, continuing anyway:', error)
            setRecentAuthEvent('login') // Default to login
          }
        } else {
          // Check for existing accounts and validate token
          const accounts = msalInstance.getAllAccounts()
          console.log('Existing accounts found:', accounts.length)
          
          if (accounts.length > 0) {
            console.log('Attempting silent token acquisition for account:', accounts[0].username)
            console.log('Account claims:', accounts[0].idTokenClaims)
            try {
              const token = await msalInstance.acquireTokenSilent({ ...tokenRequest, account: accounts[0] })
              if (token && token.accessToken) {
                console.log('Silent token acquisition successful')
                setUser(accounts[0])
                setIsAuthenticated(true)
              } else {
                console.warn('No access token available yet; staying unauthenticated temporarily')
              }
            } catch (e) {
              console.warn('Silent token acquisition failed; staying on page', e)
              // Avoid redirect loop; user can click login again
            }
          } else {
            console.log('No existing accounts found, user needs to log in')
          }
        }
      } catch (error) {
        console.error('Error during auth initialization:', error)
      } finally {
        console.log('Setting loading to false')
        setLoading(false)
      }
    }

    initializeAuth()
    // We purposely run this once on mount to bootstrap auth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async () => {
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
  }, [])

  const logout = useCallback(async () => {
    try {
      setLoading(true)
      await msalInstance.logoutRedirect({
        postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri
      })
    } catch (error) {
      console.error('Logout failed:', error)
      setLoading(false)
    }
  }, [])

  const getAccessToken = useCallback(async (): Promise<string | null> => {
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
  }, [])

  // Seeding is now user-initiated from the Welcome or Settings pages.

  const handleUserProfile = async (account: AccountInfo, accessToken: string) => {
    try {
      // First, try to get existing user profile with timeout
      let existing: any | null = null
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout
        
        const res = await authedFetch('/api/User/profile', { 
          signal: controller.signal 
        }, accessToken)
        clearTimeout(timeoutId)
        
        if (res.ok) existing = await res.json()
      } catch (error) {
        console.warn('Failed to check existing profile (continuing):', error)
      }

      if (!existing) {
        // User profile doesn't exist, create it
        console.log('Creating new user profile...')
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout
          
          const res = await authedFetch('/api/User/profile', {
            method: 'POST',
            signal: controller.signal,
            body: JSON.stringify({
              email: account.username || account.localAccountId,
              name: account.name || 'User',
              subjectId: account.localAccountId || account.homeAccountId
            })
          }, accessToken)
          clearTimeout(timeoutId)
          
          if (!res.ok) throw new Error(`Create profile failed: ${res.status}`)
          console.log('User profile created successfully')
          return true // created new profile
        } catch (error) {
          console.warn('Failed to create user profile (continuing anyway):', error)
        }
      } else {
        // User profile exists
        console.log('User profile found.')
        return false // existing profile
      }
    } catch (error) {
      console.warn('Error handling user profile (continuing anyway):', error)
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
