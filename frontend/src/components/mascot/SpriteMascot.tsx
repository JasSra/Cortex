'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { MascotState } from '@/components/Mascot'

type SpriteStateConfig = { row: number; frames: number; fps: number }
type SpriteMeta = {
  frameWidth: number
  frameHeight: number
  scale?: number
  states: Record<string, SpriteStateConfig>
}

type RegistryMascot = {
  id: string
  name: string
  author?: string
  license?: string
  homepage?: string
  sprite: string
  meta: SpriteMeta
}

type Registry = { mascots: RegistryMascot[] }

interface SpriteMascotProps {
  mascotId: string
  state?: MascotState
  message?: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  size?: 'small' | 'medium' | 'large'
  onInteraction?: () => void
  className?: string
}

const registryUrl = '/mascots/registry.json'

const sizeScale: Record<NonNullable<SpriteMascotProps['size']>, number> = {
  small: 1,
  medium: 1.25,
  large: 1.5,
}

export const SpriteMascot: React.FC<SpriteMascotProps> = ({
  mascotId,
  state = 'idle',
  message,
  position = 'bottom-right',
  size = 'medium',
  onInteraction,
  className = ''
}) => {
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [currentMessage, setCurrentMessage] = useState(message)
  const [showMessage, setShowMessage] = useState(false)
  const [frame, setFrame] = useState(0)
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  // Load registry
  useEffect(() => {
    let active = true
    fetch(registryUrl)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load mascot registry')))
      .then((data: Registry) => { if (active) setRegistry(data) })
      .catch(() => { /* fail silently; fallback handled below */ })
    return () => { active = false }
  }, [])

  // Auto-hide message after 3 seconds
  useEffect(() => {
    if (message) {
      setCurrentMessage(message)
      setShowMessage(true)
      const timer = setTimeout(() => setShowMessage(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [message])

  const mascot = useMemo(() => registry?.mascots.find(m => m.id === mascotId) || null, [registry, mascotId])

  // Determine sprite animation parameters for the current state
  const stateConfig: SpriteStateConfig | undefined = useMemo(() => {
    const map = mascot?.meta.states || {}
    return (map[state] || map['idle']) as SpriteStateConfig | undefined
  }, [mascot, state])

  // Animate frames via requestAnimationFrame using fps
  useEffect(() => {
    if (!mascot || !stateConfig) return

    setFrame(0)
    lastTimeRef.current = performance.now()

    const loop = (time: number) => {
      const delta = time - lastTimeRef.current
      const msPerFrame = 1000 / Math.max(1, stateConfig.fps)
      if (delta >= msPerFrame) {
        lastTimeRef.current = time
        setFrame(prev => (prev + 1) % Math.max(1, stateConfig.frames))
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [mascot, stateConfig])

  const getPositionClasses = () => {
    switch (position) {
      case 'bottom-right': return 'fixed bottom-6 right-6'
      case 'bottom-left': return 'fixed bottom-6 left-6'
      case 'top-right': return 'fixed top-20 right-6'
      case 'top-left': return 'fixed top-20 left-6'
      default: return 'fixed bottom-6 right-6'
    }
  }

  // Compute visual size
  const { width, height, frameWidth, frameHeight, row } = useMemo(() => {
    if (!mascot || !stateConfig) return { width: 64, height: 64, frameWidth: 32, frameHeight: 32, row: 0 }
    const baseScale = mascot.meta.scale ?? 1
    const scale = baseScale * sizeScale[size]
    const width = Math.round(mascot.meta.frameWidth * scale)
    const height = Math.round(mascot.meta.frameHeight * scale)
    return { width, height, frameWidth: mascot.meta.frameWidth, frameHeight: mascot.meta.frameHeight, row: stateConfig.row }
  }, [mascot, stateConfig, size])

  // Canvas drawing hooks must be declared unconditionally (before any early return)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!mascot) return
    const img = new Image()
    img.src = mascot.sprite
    img.onload = () => {
      imageRef.current = img
    }
    return () => {
      imageRef.current = null
    }
  }, [mascot])

  useEffect(() => {
    if (!mascot || !stateConfig) return
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // crisp pixels
    ctx.imageSmoothingEnabled = false
    // Clear and draw current frame
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const sx = frame * frameWidth
    const sy = row * frameHeight
    try {
      ctx.drawImage(img, sx, sy, frameWidth, frameHeight, 0, 0, canvas.width, canvas.height)
    } catch {}
  }, [mascot, stateConfig, frame, frameWidth, frameHeight, row, width, height])

  // Fallback: if registry or mascot missing, render nothing (after hooks are all declared)
  if (!mascot || !stateConfig) {
    return null
  }

  return (
    <div className={`${getPositionClasses()} z-50 ${className}`}>
      {/* Message Bubble */}
      <AnimatePresence>
        {showMessage && currentMessage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="absolute bottom-full mb-3 right-0 max-w-xs"
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 relative">
              <p className="text-sm text-gray-700 dark:text-gray-300">{currentMessage}</p>
              <div className="absolute top-full right-4 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white dark:border-t-gray-800"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sprite Body */}
      <motion.canvas
        ref={canvasRef}
        className="relative cursor-pointer rounded"
        width={width}
        height={height}
        onClick={onInteraction}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
      />
    </div>
  )
}

export default SpriteMascot
