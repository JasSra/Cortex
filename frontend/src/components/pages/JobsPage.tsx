'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useJobsApi, useGraphApi } from '@/services/apiClient'

interface StatSample {
  ts: number
  pending: number
  processed: number
  failed: number
  avgMs: number
  summary: string
}

const JobsPage: React.FC = () => {
  const { getStatus, statusStreamUrl, enqueueGraphEnrich } = useJobsApi()
  const { discoverAll } = useGraphApi()
  const [samples, setSamples] = useState<StatSample[]>([])
  const [current, setCurrent] = useState<any | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [noteId, setNoteId] = useState('')
  const esRef = useRef<EventSource | null>(null)

  // Connect to SSE and also fetch an initial status snapshot
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setConnecting(true)
        const url = await statusStreamUrl()
        if (cancelled) return
        const es = new EventSource(url)
        esRef.current = es
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data)
            setCurrent(data)
            setSamples(prev => [...prev, { ts: Date.now(), pending: data.pending, processed: data.processed, failed: data.failed, avgMs: data.avgMs, summary: data.summary }].slice(-200))
          } catch {}
        }
        es.onerror = () => {
          // keep UI alive; we could retry but leave it simple
        }
      } finally {
        setConnecting(false)
      }
    })()
    // initial status fallback
    getStatus().then(setCurrent).catch(() => {})
    return () => {
      cancelled = true
      esRef.current?.close()
    }
  }, [getStatus, statusStreamUrl]) // Now safe with memoized functions

  const last5 = useMemo(() => samples.slice(-50).reverse(), [samples])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Background Jobs</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {connecting ? 'Connecting…' : 'Live'}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending" value={current?.pending ?? 0} />
        <StatCard label="Processed (10m)" value={current?.processed ?? 0} />
        <StatCard label="Failed" value={current?.failed ?? 0} />
        <StatCard label="Avg ms" value={current?.avgMs ?? 0} />
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          {current?.summary || 'Background workers are idle.'}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-white">Actions</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => discoverAll().catch(() => {})}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm"
          >
            Discover Relationships (All Notes)
          </button>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={noteId}
              onChange={(e) => setNoteId(e.target.value)}
              placeholder="Note ID"
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
            />
            <button
              onClick={() => enqueueGraphEnrich(noteId || undefined).catch(() => {})}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm"
            >
              Enqueue Graph Enrich
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Recent Status Samples</h2>
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
          {last5.map(s => (
            <div key={s.ts} className="py-2 text-sm text-gray-700 dark:text-gray-300 flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">{new Date(s.ts).toLocaleTimeString()}</span>
              <span>{s.summary}</span>
            </div>
          ))}
          {last5.length === 0 && (
            <div className="py-4 text-sm text-gray-500 dark:text-gray-400">No samples yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}

const StatCard: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center"
  >
    <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
    <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
  </motion.div>
)

export default JobsPage

