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
  logout: () => void
  getAccessToken: () => Promise<string | null>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<AccountInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initializeAuth = async () => {
      await msalInstance.initialize()
      
      const accounts = msalInstance.getAllAccounts()
      if (accounts.length > 0) {
        setUser(accounts[0])
        setIsAuthenticated(true)
      }
      
      setLoading(false)
    }

    initializeAuth()
  }, [])

  const login = async () => {
    try {
      setLoading(true)
      const response: AuthenticationResult = await msalInstance.loginPopup(loginRequest)
      
      if (response.account) {
        setUser(response.account)
        setIsAuthenticated(true)
        
        // Create or get user profile and trigger seed data creation
        await handleUserProfile(response.account, response.accessToken)
      }
    } catch (error) {
      console.error('Login failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setLoading(true)
    msalInstance.logoutPopup({
      postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri
    }).then(() => {
      setUser(null)
      setIsAuthenticated(false)
      setLoading(false)
    }).catch((error) => {
      console.error('Logout failed:', error)
      setLoading(false)
    })
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

  const createSeedDataIfNeeded = async (accessToken: string) => {
    try {
      // Check if user already has notes
      const response = await fetch('/api/notes', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })
      
      if (response.ok) {
        const notes = await response.json()
        
        // If user has no notes, create seed data
        if (notes.length === 0) {
          await fetch('/api/seed-data', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          })
        }
      }
    } catch (error) {
      console.error('Failed to create seed data:', error)
    }
  }

  const handleUserProfile = async (account: AccountInfo, accessToken: string) => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
      
      // First, try to get existing user profile
      const profileResponse = await fetch(`${baseUrl}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (profileResponse.status === 404) {
        // User profile doesn't exist, create it
        console.log('Creating new user profile...')
        const createProfileResponse = await fetch(`${baseUrl}/api/user/profile`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: account.username || account.localAccountId,
            name: account.name || 'User',
            subjectId: account.localAccountId || account.homeAccountId
          })
        })

        if (createProfileResponse.ok) {
          console.log('User profile created successfully')
          // Create seed data for new user
          await createSeedDataIfNeeded(accessToken)
        } else {
          console.error('Failed to create user profile')
        }
      } else if (profileResponse.ok) {
        // User profile exists, check for seed data
        console.log('User profile found, checking for existing data...')
        await createSeedDataIfNeeded(accessToken)
      } else {
        console.error('Failed to retrieve user profile')
      }
    } catch (error) {
      console.error('Error handling user profile:', error)
      // Still try to create seed data even if profile handling fails
      await createSeedDataIfNeeded(accessToken)
    }
  }

  const value: AuthContextType = {
    isAuthenticated,
    user,
    login,
    logout,
    getAccessToken,
    loading
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
