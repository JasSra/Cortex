'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { 
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ServerIcon,
  CpuChipIcon,
  CircleStackIcon,
  CloudIcon,
  BoltIcon,
  QueueListIcon
} from '@heroicons/react/24/outline'
import { useHealthApi, useJobsApi } from '@/services/apiClient'

interface HealthData {
  status: string
  redis: {
    configured: boolean
    connected: boolean
    pingMs: number
    streams: Record<string, { length: number; pendingPEL: number }>
  }
  embeddings: {
    provider: string
    model: string
    dim: number
    ok: boolean
    latencyMs: number
    error?: string
  }
  openAI: {
    configured: boolean
    reachable: boolean
    latencyMs: number
    error?: string
  }
  jobs: {
    pending: number
    processedRecently: number
    pendingBacklog: number
  // Streams removed; Hangfire-only
  }
  db: {
    ok: boolean
    provider: string
    dataSource?: string
  }
}

interface JobsData {
  pending: number
  processed: number
  failed: number
  avgMs: number
  summary: string
}

// Helper components moved outside to prevent re-creation
const StatusCard: React.FC<{
  title: string
  icon: React.ReactNode
  status: 'ok' | 'degraded' | 'error'
  details: React.ReactNode
  getStatusIcon: (status: string) => React.ReactNode
}> = React.memo(({ title, icon, status, details, getStatusIcon }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm"
  >
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        {icon}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      {getStatusIcon(status)}
    </div>
    <div className="space-y-2">
      {details}
    </div>
  </motion.div>
))
StatusCard.displayName = 'StatusCard'

const DetailRow: React.FC<{
  label: string
  value: string | number
  status?: 'ok' | 'degraded' | 'error'
}> = React.memo(({ label, value, status }) => (
  <div className="flex justify-between text-sm">
    <span className="text-gray-600 dark:text-gray-400">{label}:</span>
    <span className={
      status === 'ok' ? 'text-green-600 dark:text-green-400' :
      status === 'degraded' ? 'text-yellow-600 dark:text-yellow-400' :
      status === 'error' ? 'text-red-600 dark:text-red-400' :
      'text-gray-900 dark:text-white'
    }>
      {value}
    </span>
  </div>
))
DetailRow.displayName = 'DetailRow'

const SystemPage: React.FC = () => {
  const { getSystemHealth } = useHealthApi()
  const { getStatus } = useJobsApi()
  const [healthData, setHealthData] = useState<HealthData | null>(null)
  const [jobsData, setJobsData] = useState<JobsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const [healthResponse, jobsResponse] = await Promise.all([
        getSystemHealth(),
        getStatus()
      ])
      
      setHealthData(healthResponse as any)
      setJobsData(jobsResponse as any)
      setLastRefresh(new Date().toLocaleTimeString())
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch system data')
      console.error('System data fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [getSystemHealth, getStatus])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getStatusIcon = useCallback((status: string, size = 'w-5 h-5') => {
    switch (status) {
      case 'ok':
        return <CheckCircleIcon className={`${size} text-green-500`} />
      case 'degraded':
        return <ExclamationTriangleIcon className={`${size} text-yellow-500`} />
      case 'error':
        return <XCircleIcon className={`${size} text-red-500`} />
      default:
        return <ExclamationTriangleIcon className={`${size} text-gray-500`} />
    }
  }, [])

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'ok': return 'text-green-600 dark:text-green-400'
      case 'degraded': return 'text-yellow-600 dark:text-yellow-400'
      case 'error': return 'text-red-600 dark:text-red-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }, [])

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Status</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Monitor system health and background job performance
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {lastRefresh && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Last updated: {lastRefresh}
            </span>
          )}
          
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-xl transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4"
        >
          <div className="flex items-center gap-2">
            <XCircleIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
            <span className="text-red-800 dark:text-red-200">{error}</span>
          </div>
        </motion.div>
      )}

      {/* Overall Status */}
      {healthData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-4">
            {getStatusIcon(healthData.status, 'w-6 h-6')}
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Overall Status: 
              <span className={`ml-2 capitalize ${getStatusColor(healthData.status)}`}>
                {healthData.status}
              </span>
            </h2>
          </div>
        </motion.div>
      )}

      {/* System Components Grid */}
      {healthData && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Database */}
          <StatusCard
            title="Database"
            icon={<CircleStackIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />}
            status={healthData.db.ok ? 'ok' : 'error'}
            getStatusIcon={getStatusIcon}
            details={
              <>
                <DetailRow label="Status" value={healthData.db.ok ? 'Connected' : 'Error'} />
                <DetailRow label="Provider" value={healthData.db.provider} />
                {healthData.db.dataSource && (
                  <DetailRow label="Data Source" value={healthData.db.dataSource} />
                )}
              </>
            }
          />

          {/* Redis */}
          <StatusCard
            title="Redis Cache"
            icon={<ServerIcon className="w-6 h-6 text-red-600 dark:text-red-400" />}
            status={
              !healthData.redis.configured ? 'error' :
              !healthData.redis.connected ? 'error' : 'ok'
            }
            getStatusIcon={getStatusIcon}
            details={
              <>
                <DetailRow 
                  label="Configured" 
                  value={healthData.redis.configured ? 'Yes' : 'No'}
                  status={healthData.redis.configured ? 'ok' : 'error'}
                />
                <DetailRow 
                  label="Connected" 
                  value={healthData.redis.connected ? 'Yes' : 'No'}
                  status={healthData.redis.connected ? 'ok' : 'error'}
                />
                {healthData.redis.connected && (
                  <DetailRow 
                    label="Ping" 
                    value={`${healthData.redis.pingMs}ms`}
                    status={healthData.redis.pingMs < 100 ? 'ok' : 'degraded'}
                  />
                )}
              </>
            }
          />

          {/* Embeddings */}
          <StatusCard
            title="Embeddings"
            icon={<CpuChipIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />}
            status={healthData.embeddings.ok ? 'ok' : 'error'}
            getStatusIcon={getStatusIcon}
            details={
              <>
                <DetailRow label="Provider" value={healthData.embeddings.provider} />
                <DetailRow label="Model" value={healthData.embeddings.model} />
                <DetailRow label="Dimensions" value={healthData.embeddings.dim} />
                <DetailRow 
                  label="Status" 
                  value={healthData.embeddings.ok ? 'OK' : 'Error'}
                  status={healthData.embeddings.ok ? 'ok' : 'error'}
                />
                <DetailRow 
                  label="Latency" 
                  value={`${healthData.embeddings.latencyMs}ms`}
                  status={healthData.embeddings.latencyMs < 1000 ? 'ok' : 'degraded'}
                />
                {healthData.embeddings.error && (
                  <div className="text-red-600 dark:text-red-400 text-xs mt-2">
                    {healthData.embeddings.error}
                  </div>
                )}
              </>
            }
          />

          {/* OpenAI */}
          <StatusCard
            title="OpenAI API"
            icon={<CloudIcon className="w-6 h-6 text-green-600 dark:text-green-400" />}
            status={
              !healthData.openAI.configured ? 'degraded' :
              !healthData.openAI.reachable ? 'error' : 'ok'
            }
            getStatusIcon={getStatusIcon}
            details={
              <>
                <DetailRow 
                  label="Configured" 
                  value={healthData.openAI.configured ? 'Yes' : 'No'}
                  status={healthData.openAI.configured ? 'ok' : 'degraded'}
                />
                {healthData.openAI.configured && (
                  <>
                    <DetailRow 
                      label="Reachable" 
                      value={healthData.openAI.reachable ? 'Yes' : 'No'}
                      status={healthData.openAI.reachable ? 'ok' : 'error'}
                    />
                    <DetailRow 
                      label="Latency" 
                      value={`${healthData.openAI.latencyMs}ms`}
                      status={healthData.openAI.latencyMs < 2000 ? 'ok' : 'degraded'}
                    />
                  </>
                )}
                {healthData.openAI.error && (
                  <div className="text-red-600 dark:text-red-400 text-xs mt-2">
                    {healthData.openAI.error}
                  </div>
                )}
              </>
            }
          />

          {/* Background Jobs */}
          <StatusCard
            title="Background Jobs (Hangfire)"
            icon={<BoltIcon className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />}
            status={healthData.jobs.pendingBacklog > 100 ? 'degraded' : 'ok'}
            getStatusIcon={getStatusIcon}
            details={
              <>
                <DetailRow 
                  label="Pending" 
                  value={healthData.jobs.pending}
                  status={healthData.jobs.pending > 50 ? 'degraded' : 'ok'}
                />
                <DetailRow 
                  label="Backlog" 
                  value={healthData.jobs.pendingBacklog}
                  status={healthData.jobs.pendingBacklog > 100 ? 'degraded' : 'ok'}
                />
                <DetailRow label="Processed (10m)" value={healthData.jobs.processedRecently} />
                
                {/* Hangfire Dashboard Link */}
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600">
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/hangfire`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open Hangfire Dashboard
                  </a>
                </div>
              </>
            }
          />

          {/* Redis Streams section removed (Hangfire-only) */}
        </div>
      )}

      {/* Current Jobs Performance */}
      {jobsData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Current Job Performance
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {jobsData.pending}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Pending</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {jobsData.processed}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Processed (10m)</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {jobsData.failed}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {jobsData.avgMs}ms
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Avg Time</div>
            </div>
          </div>
          
          {jobsData.summary && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Summary:</strong> {jobsData.summary}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

export default SystemPage
