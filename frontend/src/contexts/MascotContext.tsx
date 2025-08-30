'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import Mascot, { MascotState } from '../components/Mascot'
import SpriteMascot from '@/components/mascot/SpriteMascot'

interface MascotContextType {
  state: MascotState
  message: string | undefined
  setState: (state: MascotState) => void
  setMessage: (message: string) => void
  speak: (message: string, state?: MascotState) => void
  celebrate: () => void
  error: (message: string) => void
  suggest: (message: string) => void
  listen: () => void
  think: () => void
  respond: () => void
  idle: () => void
  selectedMascotId?: string
  setSelectedMascotId: (id?: string) => void
}

const MascotContext = createContext<MascotContextType | undefined>(undefined)

interface MascotProviderProps {
  children: React.ReactNode
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  size?: 'small' | 'medium' | 'large'
}

export const MascotProvider: React.FC<MascotProviderProps> = ({ 
  children, 
  position = 'bottom-right',
  size = 'medium'
}) => {
  const [state, setState] = useState<MascotState>('idle')
  const [message, setMessage] = useState<string | undefined>()
  const [selectedMascotId, setSelectedMascotIdState] = useState<string | undefined>(undefined)

  // Load/persist selected mascot
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cortex.selectedMascotId')
      if (saved) setSelectedMascotIdState(saved)
    } catch {}
  }, [])

  // First-run default: if no selection, pick the first mascot from registry (if available)
  useEffect(() => {
    if (selectedMascotId) return
    let active = true
    fetch('/mascots/registry.json')
      .then(r => r.ok ? r.json() : null)
      .then((data: { mascots?: Array<{ id: string }> } | null) => {
        if (!active || !data?.mascots?.length) return
        const firstId = data.mascots[0].id
        // call the state setter directly to avoid dependency on callback definition order
        setSelectedMascotIdState(firstId)
        try { localStorage.setItem('cortex.selectedMascotId', firstId) } catch {}
      })
      .catch(() => {})
    return () => { active = false }
  }, [selectedMascotId])

  const setSelectedMascotId = useCallback((id?: string) => {
    setSelectedMascotIdState(id)
    try {
      if (id) localStorage.setItem('cortex.selectedMascotId', id)
      else localStorage.removeItem('cortex.selectedMascotId')
    } catch {}
  }, [])

  // Helper functions for common mascot interactions
  const speak = useCallback((msg: string, newState: MascotState = 'responding') => {
    setMessage(msg)
    setState(newState)
    
    // Return to idle after speaking
    setTimeout(() => {
      setState('idle')
    }, 3000)
  }, [])

  const celebrate = useCallback(() => {
    setState('celebrating')
    setMessage('Great job! 🎉')
    
    setTimeout(() => {
      setState('idle')
    }, 2000)
  }, [])

  const error = useCallback((msg: string) => {
    setState('error')
    setMessage(msg)
    
    setTimeout(() => {
      setState('idle')
    }, 3000)
  }, [])

  const suggest = useCallback((msg: string) => {
    setState('suggesting')
    setMessage(msg)
    
    setTimeout(() => {
      setState('idle')
    }, 4000)
  }, [])

  const listen = useCallback(() => {
    setState('listening')
    setMessage('I\'m listening...')
  }, [])

  const think = useCallback(() => {
    setState('thinking')
    setMessage('Let me think about that...')
  }, [])

  const respond = useCallback(() => {
    setState('responding')
    setMessage('')
  }, [])

  const idle = useCallback(() => {
    setState('idle')
    setMessage('')
  }, [])

  const handleMascotInteraction = useCallback(() => {
    const randomGreetings = [
      "Hi there! How can I help you today?",
      "Need some assistance? I'm here to help!",
      "Ready to explore your knowledge base?",
      "What would you like to discover today?",
      "I'm your AI companion - let's get started!"
    ]
    
    const randomGreeting = randomGreetings[Math.floor(Math.random() * randomGreetings.length)]
    speak(randomGreeting)
  }, [speak])

  const contextValue: MascotContextType = {
    state,
    message,
    setState,
    setMessage,
    speak,
    celebrate,
    error,
    suggest,
    listen,
    think,
    respond,
  idle,
  selectedMascotId,
  setSelectedMascotId
  }

  return (
    <MascotContext.Provider value={contextValue}>
      {children}
      {selectedMascotId ? (
        <SpriteMascot
          mascotId={selectedMascotId}
          state={state}
          message={message}
          position={position}
          size={size}
          onInteraction={handleMascotInteraction}
        />
      ) : (
        <Mascot
          state={state}
          message={message}
          position={position}
          size={size}
          onInteraction={handleMascotInteraction}
        />
      )}
    </MascotContext.Provider>
  )
}

export const useMascot = (): MascotContextType => {
  const context = useContext(MascotContext)
  if (!context) {
    throw new Error('useMascot must be used within a MascotProvider')
  }
  return context
}
