"use client"

import React, { useEffect, useRef, useState } from 'react'

// Lightweight wrapper that attempts to render Microsoft Adaptive Cards when the
// optional dependency is installed. If it's not available, falls back to a
// formatted JSON preview so the UI still works.

type AdaptiveCardsModule = typeof import('adaptivecards')

export interface AdaptiveCardViewProps {
  card: any
  className?: string
}

const AdaptiveCardView: React.FC<AdaptiveCardViewProps> = ({ card, className }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ac, setAc] = useState<AdaptiveCardsModule | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    // Lazy-load to avoid breaking if package isn't installed yet
    import('adaptivecards')
      .then(mod => { if (mounted) setAc(mod) })
      .catch(() => { if (mounted) setAc(null) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!ac || !containerRef.current) return
    try {
      // Clear previous render
      containerRef.current.innerHTML = ''

      const cardInstance = new ac.AdaptiveCard()
      // Allow most features by default; callers should provide safe content
      cardInstance.parse(card)
      const rendered = cardInstance.render()
      containerRef.current.appendChild(rendered)
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Failed to render adaptive card')
    }
  }, [ac, card])

  if (!ac) {
    return (
      <div className={`p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${className || ''}`}>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Adaptive Cards renderer not installed. Showing JSON.</div>
        <pre className="text-xs overflow-auto text-gray-700 dark:text-gray-200 max-h-64">{JSON.stringify(card, null, 2)}</pre>
      </div>
    )
  }

  return (
    <div className={`ac-container ${className || ''}`}>
      {error ? (
        <div className="text-xs text-red-500">{error}</div>
      ) : (
        <div ref={containerRef} className="adaptivecard" />
      )}
    </div>
  )
}

export default AdaptiveCardView

