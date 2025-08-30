'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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

interface MascotPickerProps {
  isOpen: boolean
  selectedId?: string
  onClose: () => void
  onSelect: (id?: string) => void
}

const registryUrl = '/mascots/registry.json'

const MascotCard: React.FC<{ mascot: RegistryMascot; selected: boolean; unavailable?: boolean; onClick: () => void }>
  = ({ mascot, selected, unavailable = false, onClick }) => {
  const canvasId = useMemo(() => `preview-${mascot.id}`,[mascot.id])
  const dims = useMemo(() => {
    const meta = mascot.meta
    const scale = meta.scale ?? 1
    return { w: meta.frameWidth * scale, h: meta.frameHeight * scale }
  }, [mascot])

  useEffect(() => {
    let active = true
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.src = mascot.sprite
    img.onload = () => {
      if (!active) return
      ctx.imageSmoothingEnabled = false
      const idle = mascot.meta.states['idle'] || { row: 0, frames: 1, fps: 1 }
      const sx = 0
      const sy = idle.row * mascot.meta.frameHeight
      ctx.clearRect(0,0,canvas.width, canvas.height)
      try { ctx.drawImage(img, sx, sy, mascot.meta.frameWidth, mascot.meta.frameHeight, 0, 0, canvas.width, canvas.height) } catch {}
    }
    return () => { active = false }
  }, [canvasId, mascot])

  return (
    <button
      onClick={onClick}
      disabled={unavailable}
      className={`group w-full border rounded-xl p-3 text-left hover:shadow-md transition ${selected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200 dark:border-slate-700'} ${unavailable ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center space-x-3">
        <canvas id={canvasId} width={dims.w} height={dims.h} className="rounded" />
        <div>
          <div className="font-medium text-gray-900 dark:text-slate-100">{mascot.name}</div>
          <div className="text-xs text-gray-500 dark:text-slate-400">
            {unavailable ? 'Missing sprite asset' : `${mascot.author || 'Unknown author'} · ${mascot.license || 'License N/A'}`}
          </div>
        </div>
      </div>
    </button>
  )
}

const MascotPicker: React.FC<MascotPickerProps> = ({ isOpen, selectedId, onClose, onSelect }) => {
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    fetch(registryUrl)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load registry')))
      .then((data: Registry) => {
        setRegistry(data)
        // probe image availability
        const checks: Array<Promise<void>> = []
        const nextAvailability: Record<string, boolean> = {}
        data.mascots.forEach(m => {
          checks.push(new Promise<void>((resolve) => {
            const img = new Image()
            let done = false
            const finish = (ok: boolean) => { if (!done) { done = true; nextAvailability[m.id] = ok; resolve() } }
            img.onload = () => finish(true)
            img.onerror = () => finish(false)
            img.src = m.sprite
            // timeout as fallback
            setTimeout(() => finish(true), 1500)
          }))
        })
        Promise.all(checks).then(() => setAvailability(nextAvailability))
      })
      .catch((e: any) => setError(e.message || 'Failed to load mascots'))
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Choose your mascot</h3>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200">✕</button>
            </div>
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {registry?.mascots.map(m => (
                <MascotCard key={m.id} mascot={m} selected={m.id === selectedId} unavailable={availability[m.id] === false} onClick={() => onSelect(m.id)} />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-gray-500 dark:text-slate-400">
                Only CC0/public domain or properly licensed assets are included.
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onSelect(undefined)} className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800">
                  Reset to default
                </button>
              </div>
            </div>
            
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default MascotPicker
