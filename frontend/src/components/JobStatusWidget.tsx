"use client"

import React, { useEffect, useState } from 'react'
import { useJobsApi } from '@/services/apiClient'

type JobStatus = {
  summary: string
  pending: number
  processed: number
  failed: number
  avgMs: number
}

export default function JobStatusWidget({ intervalMs = 12000 }: { intervalMs?: number }) {
  const jobs = useJobsApi()
  const [status, setStatus] = useState<JobStatus | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const load = async () => {
    try {
      setLoading(true)
      const s = await jobs.getStatus()
      setStatus(s)
    } catch (e) {
      // ignore errors; keep last status
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Prefer SSE when available; fallback to polling
    let cleanup: (() => void) | null = null
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      cleanup = jobs.subscribeStatusStream((s) => setStatus(s))
      // Kick a single fetch so UI isn't empty until first event
      load()
    } else {
      load()
      const t = setInterval(load, Math.max(5000, intervalMs))
      cleanup = () => clearInterval(t)
    }
    return () => { cleanup && cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs])

  return (
    <div
      className="hidden md:flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700"
      title={status?.summary || 'Background workers'}
    >
      <span className={`h-2 w-2 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : (status && status.pending > 0 ? 'bg-blue-500' : 'bg-emerald-500')}`}></span>
      <span className="truncate max-w-[280px]">
        {status?.summary || 'Jobs: idle'}
      </span>
    </div>
  )
}
