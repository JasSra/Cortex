'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

export interface ConnectivityStatus {
  isOnline: boolean
  responseTime?: number
  lastCheck?: string
  details?: string
  error?: string
}

export interface ConnectivityContextType {
  status: ConnectivityStatus
  isMonitoring: boolean
  startMonitoring: () => void
  stopMonitoring: () => void
  manualCheck: () => void
  showBackdrop: boolean
}

const ConnectivityContext = createContext<ConnectivityContextType | undefined>(undefined)

export interface ConnectivityProviderProps {
  children: ReactNode
  baseUrl?: string
  checkInterval?: number
  timeout?: number
  autoStart?: boolean
}

export function ConnectivityProvider({
  children,
  baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081',
  checkInterval = 10000, // 10 seconds
  timeout = 5000, // 5 seconds
  autoStart = true
}: ConnectivityProviderProps) {
  const [status, setStatus] = useState<ConnectivityStatus>({
    isOnline: true // Assume online initially
  })
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [worker, setWorker] = useState<Worker | null>(null)
  const [showBackdrop, setShowBackdrop] = useState(false)

  // Initialize web worker
  useEffect(() => {
    if (typeof window === 'undefined' || !('Worker' in window)) {
      console.warn('Web Workers not supported in this environment')
      return
    }

    const workerInstance = new Worker('/workers/connectivity-monitor.js')
    
    workerInstance.onmessage = (event) => {
      const { type, ...data } = event.data
      
      switch (type) {
        case 'WORKER_READY':
          console.log('Connectivity monitor worker ready')
          setWorker(workerInstance)
          break
          
        case 'MONITOR_STARTED':
          setIsMonitoring(true)
          console.log('Connectivity monitoring started:', data)
          break
          
        case 'MONITOR_STOPPED':
          setIsMonitoring(false)
          console.log('Connectivity monitoring stopped')
          break
          
        case 'CONNECTIVITY_CHANGED':
          console.log('Connectivity status changed:', data)
          setStatus({
            isOnline: data.isOnline,
            responseTime: data.responseTime,
            lastCheck: data.timestamp,
            details: data.details,
            error: data.error
          })
          // Show backdrop when going offline, hide when coming online
          setShowBackdrop(!data.isOnline)
          break
          
        case 'HEALTH_CHECK':
          setStatus({
            isOnline: data.isOnline,
            responseTime: data.responseTime,
            lastCheck: data.timestamp,
            details: data.details,
            error: data.error
          })
          break
          
        case 'WORKER_ERROR':
          console.error('Connectivity worker error:', data)
          break
          
        case 'ERROR':
          console.error('Connectivity monitor error:', data.message)
          break
          
        default:
          console.log('Unknown message from connectivity worker:', event.data)
      }
    }
    
    workerInstance.onerror = (error) => {
      console.error('Connectivity worker error:', error)
    }
    
    return () => {
      workerInstance.terminate()
      setWorker(null)
      setIsMonitoring(false)
    }
  }, [])

  const startMonitoring = useCallback(() => {
    if (worker) {
      worker.postMessage({
        type: 'START_MONITORING',
        data: {
          baseUrl,
          checkInterval,
          timeout
        }
      })
    }
  }, [worker, baseUrl, checkInterval, timeout])

  const stopMonitoring = useCallback(() => {
    if (worker) {
      worker.postMessage({ type: 'STOP_MONITORING' })
      setShowBackdrop(false) // Hide backdrop when stopping monitoring
    }
  }, [worker])

  const manualCheck = useCallback(() => {
    if (worker) {
      worker.postMessage({ type: 'MANUAL_CHECK' })
    }
  }, [worker])

  // Auto-start monitoring when worker is ready
  useEffect(() => {
    if (worker && autoStart && !isMonitoring) {
      startMonitoring()
    }
  }, [worker, autoStart, isMonitoring, startMonitoring])

  // Update worker config when props change
  useEffect(() => {
    if (worker && isMonitoring) {
      worker.postMessage({
        type: 'UPDATE_CONFIG',
        data: {
          baseUrl,
          checkInterval,
          timeout
        }
      })
    }
  }, [worker, baseUrl, checkInterval, timeout, isMonitoring])

  const contextValue: ConnectivityContextType = {
    status,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    manualCheck,
    showBackdrop
  }

  return (
    <ConnectivityContext.Provider value={contextValue}>
      {children}
    </ConnectivityContext.Provider>
  )
}

export function useConnectivity(): ConnectivityContextType {
  const context = useContext(ConnectivityContext)
  if (context === undefined) {
    throw new Error('useConnectivity must be used within a ConnectivityProvider')
  }
  return context
}

// Hook for just the online status (simplified)
export function useIsOnline(): boolean {
  const { status } = useConnectivity()
  return status.isOnline
}
