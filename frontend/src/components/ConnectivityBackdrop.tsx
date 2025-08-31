'use client'

import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useConnectivity } from '@/contexts/ConnectivityContext'

export default function ConnectivityBackdrop() {
  const { showBackdrop, status, manualCheck, isMonitoring } = useConnectivity()
  const [showTech, setShowTech] = useState(false)

  // Build a compact technical diagnostics object for display/copy
  const tech = useMemo(() => {
    return {
      isOnline: status.isOnline,
      responseTimeMs: status.responseTime ?? null,
      timestamp: status.lastCheck ?? null,
      details: status.details ?? null,
      error: status.error ?? null,
      apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081',
      monitoring: isMonitoring
    }
  }, [status.isOnline, status.responseTime, status.lastCheck, status.details, status.error, isMonitoring])

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(tech, null, 2))
    } catch (err) {
      console.error('Failed to copy details', err)
    }
  }

  return (
    <AnimatePresence>
      {showBackdrop && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8 max-w-md mx-4 text-center"
          >
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                <ExclamationTriangleIcon className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Connection Lost
            </h2>

            {/* Message */}
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              We&apos;ve temporarily lost connection to the server. Don&apos;t worry — we&apos;ll be back momentarily.
              Your work is safe and we&apos;re working to restore the connection.
            </p>

            {/* Status Details */}
            {status.details && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6 text-left">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Details:
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {status.details}
                </div>
                {status.lastCheck && (
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    Last checked: {new Date(status.lastCheck).toLocaleTimeString()}
                  </div>
                )}
              </div>
            )}

            {/* Technical details (collapsible) */}
            <div className="mb-6 text-left">
              <button
                onClick={() => setShowTech((v) => !v)}
                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showTech ? 'Hide technical details' : 'Show technical details'}
              </button>
              <AnimatePresence>
                {showTech && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 overflow-hidden"
                  >
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60">
                      <div className="p-3 grid grid-cols-1 gap-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Online</span><span className="text-gray-900 dark:text-gray-100">{String(tech.isOnline)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Response time</span><span className="text-gray-900 dark:text-gray-100">{tech.responseTimeMs ?? '—'} ms</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Timestamp</span><span className="text-gray-900 dark:text-gray-100">{tech.timestamp ? new Date(tech.timestamp).toLocaleString() : '—'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">API URL</span><span className="text-gray-900 dark:text-gray-100 truncate max-w-[60%]" title={tech.apiUrl}>{tech.apiUrl}</span></div>
                        {tech.error && (
                          <div className="flex justify-between"><span className="text-gray-500">Error</span><span className="text-rose-600 dark:text-rose-400">{tech.error}</span></div>
                        )}
                        {tech.details && (
                          <div className="mt-2 text-gray-600 dark:text-gray-300">{tech.details}</div>
                        )}
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-700 p-2 flex justify-end">
                        <button onClick={copyDetails} className="text-xs px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600">
                          Copy details
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                onClick={manualCheck}
                disabled={!isMonitoring}
                className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-xl font-medium transition-colors"
              >
                <ArrowPathIcon className="w-5 h-5" />
                Check Connection
              </button>
              
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {isMonitoring ? (
                  'Automatically checking every 10 seconds...'
                ) : (
                  'Connection monitoring is paused'
                )}
              </div>
            </div>

            {/* Loading Animation */}
            <div className="mt-6 flex justify-center">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.6, 1, 0.6]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.2
                    }}
                    className="w-2 h-2 bg-blue-500 rounded-full"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
