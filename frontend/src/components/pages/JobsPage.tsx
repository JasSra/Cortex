'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useJobsApi, useGraphApi, useAdminApi } from '@/services/apiClient'

interface JobDetails {
  id: string
  type: string
  stream?: string
  enqueuedAt: string
  payload?: any
}

interface StatSample {
  ts: number
  pending: number
  processed: number
  failed: number
  avgMs: number
  summary: string
}

const JobsPage: React.FC = () => {
  const { getStatus, getPendingJobs, statusStreamUrl, enqueueGraphEnrich } = useJobsApi()
  const { discoverAll } = useGraphApi()
  const { getSystemStats } = useAdminApi()
  const [samples, setSamples] = useState<StatSample[]>([])
  const [current, setCurrent] = useState<any | null>(null)
  const [pendingJobs, setPendingJobs] = useState<JobDetails[]>([])
  const [showDetails, setShowDetails] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [noteId, setNoteId] = useState('')
  const [reembedding, setReembedding] = useState(false)
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

  // Fetch pending jobs details when showing details
  useEffect(() => {
    if (showDetails) {
      getPendingJobs().then(setPendingJobs).catch(() => setPendingJobs([]))
    }
  }, [showDetails, getPendingJobs])

  // Custom reembed function with required confirmation header
  const triggerReembed = async () => {
    const response = await fetch('/api/admin/reembed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Confirm-Delete': 'true'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Re-embed failed: ${response.statusText}`)
    }
    
    return response.json()
  }

  const last5 = useMemo(() => samples.slice(-50).reverse(), [samples])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Background Jobs</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {connecting ? 'Connecting…' : 'Live'}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Pending" value={current?.pending ?? 0} />
        <StatCard label="Processed (10m)" value={current?.processed ?? 0} />
        <StatCard label="Failed" value={current?.failed ?? 0} />
        <StatCard label="Avg ms" value={current?.avgMs ?? 0} />
        <StatCard label="Redis Connected" value={current?.redisConnected ? "Yes" : "No"} />
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          {current?.summary || 'Background workers are idle.'}
        </div>
      </div>

      {current?.pending > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Pending Jobs Details</h2>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
            >
              {showDetails ? 'Hide Details' : `Show Details (${current.pending})`}
            </button>
          </div>
          
          {showDetails && (
            <div className="space-y-3">
              {pendingJobs.length > 0 ? (
                <div className="max-h-96 overflow-y-auto">
                  <div className="space-y-2">
                    {pendingJobs.map((job, index) => (
                      <JobDetailsCard key={job.id || index} job={job} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading job details...</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">Job Management</h2>
        
        {/* Hangfire Dashboard Link */}
        <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-1">Hangfire Dashboard</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Access the full Hangfire dashboard for detailed job monitoring, scheduling, and management
              </p>
            </div>
            <a
              href="/api/hangfire"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Dashboard
            </a>
          </div>
        </div>
        
        {/* Job Actions */}
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">Job Actions</h3>
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
        
        {/* Fix Indexing Section */}
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">Fix Indexing Issues</h3>
          <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800 mb-3">
            <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
              If you see notes showing &ldquo;Not indexed&rdquo; status, this will regenerate embeddings for all chunks that are missing them.
            </p>
            <button
              onClick={async () => {
                if (reembedding) return
                setReembedding(true)
                try {
                  // Add confirmation header as required by the endpoint
                  await triggerReembed()
                  alert('Re-embedding started! Check the job status above for progress.')
                } catch (error: any) {
                  alert(`Re-embedding failed: ${error?.message || 'Unknown error'}`)
                } finally {
                  setReembedding(false)
                }
              }}
              disabled={reembedding}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white rounded-lg text-sm font-medium"
            >
              {reembedding ? 'Re-embedding...' : 'Fix &ldquo;Not Indexed&rdquo; Notes'}
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

const StatCard: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center"
  >
    <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
    <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
  </motion.div>
)

const JobDetailsCard: React.FC<{ job: JobDetails }> = ({ job }) => {
  const [expanded, setExpanded] = useState(false)
  
  // Parse the payload if it's a JSON string
  const payload = job.payload || {}
  const innerPayload = payload.payload ? JSON.parse(payload.payload) : {}
  const reason = (payload as any).PendingReason || (payload as any).pendingReason || (job.stream === 'backlog' ? 'Embedding missing; waiting for polling processor' : 'Queued; awaiting worker')
  const summaryParts: string[] = []
  if (innerPayload.ChunkId) summaryParts.push(`Chunk ${innerPayload.ChunkId}`)
  if (innerPayload.NoteId) summaryParts.push(`Note ${innerPayload.NoteId}`)
  const summary = summaryParts.join(' • ')
  
  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {job.type}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {job.stream}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {job.enqueuedAt ? new Date(job.enqueuedAt).toLocaleString() : 'N/A'}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 hover:text-blue-700"
        >
          {expanded ? 'Hide' : 'Show'} Payload
        </button>
      </div>
      
      <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
            {reason}
          </span>
          {summary && (
            <span className="text-xs text-gray-600 dark:text-gray-300">{summary}</span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">ID: {job.id}</span>
        </div>
      </div>
      
      {expanded && (
        <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-600 rounded text-xs font-mono">
          <div className="mb-2">
            <strong>Chunk ID:</strong> {innerPayload.ChunkId || 'N/A'}
          </div>
          <div className="mb-2">
            <strong>Note ID:</strong> {innerPayload.NoteId || 'N/A'}
          </div>
          <div className="mb-2">
            <strong>User ID:</strong> {innerPayload.UserId || 'N/A'}
          </div>
          <div>
            <strong>Full Payload:</strong>
            <pre className="mt-1 text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default JobsPage

