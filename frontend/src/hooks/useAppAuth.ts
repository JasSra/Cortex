'use client'

import { useAuth } from '@/contexts/AuthContext'

// Development shim removed: always use real MSAL auth so logout works consistently
export function useAppAuth() {
  return useAuth()
}
