'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrashIcon,
  DocumentTextIcon,
  CubeIcon,
  ShareIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import type { NoteDeletionPlan } from '@/types/api'

interface DeletionPlanDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  noteId: string
  getDeletionPlan: (id: string) => Promise<NoteDeletionPlan>
}

export default function DeletionPlanDialog({
  isOpen,
  onClose,
  onConfirm,
  noteId,
  getDeletionPlan
}: DeletionPlanDialogProps) {
  const [deletionPlan, setDeletionPlan] = useState<NoteDeletionPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && noteId) {
      setLoading(true)
      setError(null)
      getDeletionPlan(noteId)
        .then(plan => {
          setDeletionPlan(plan)
        })
        .catch(err => {
          console.error('Failed to get deletion plan:', err)
          setError('Failed to load deletion details')
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [isOpen, noteId, getDeletionPlan])

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-lg w-full border border-gray-200 dark:border-slate-700 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Delete Note
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Review what will be deleted
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              title="Close dialog"
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 mb-6">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {deletionPlan && !loading && (
            <div className="space-y-4 mb-6">
              {deletionPlan.found ? (
                <>
                  <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <DocumentTextIcon className="w-4 h-4" />
                      {deletionPlan.noteTitle}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-slate-400">
                      This note and all associated data will be permanently deleted.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h5 className="font-medium text-gray-900 dark:text-white">
                      The following will be deleted:
                    </h5>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <CubeIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <div>
                          <div className="text-sm font-medium text-red-800 dark:text-red-300">
                            {deletionPlan.chunkCount} Chunks
                          </div>
                          <div className="text-xs text-red-600 dark:text-red-400">
                            Text segments
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <ShareIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <div>
                          <div className="text-sm font-medium text-red-800 dark:text-red-300">
                            {deletionPlan.embeddingCount} Embeddings
                          </div>
                          <div className="text-xs text-red-600 dark:text-red-400">
                            Vector data
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <ShareIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <div>
                          <div className="text-sm font-medium text-red-800 dark:text-red-300">
                            {deletionPlan.entityCount} Entities
                          </div>
                          <div className="text-xs text-red-600 dark:text-red-400">
                            Graph nodes
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <ShareIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <div>
                          <div className="text-sm font-medium text-red-800 dark:text-red-300">
                            {deletionPlan.edgeCount} Edges
                          </div>
                          <div className="text-xs text-red-600 dark:text-red-400">
                            Graph relationships
                          </div>
                        </div>
                      </div>
                    </div>

                    {deletionPlan.hasStoredFile && (
                      <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <DocumentIcon className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        <div>
                          <div className="text-sm font-medium text-orange-800 dark:text-orange-300">
                            Original File
                          </div>
                          <div className="text-xs text-orange-600 dark:text-orange-400">
                            The uploaded file will also be deleted
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-start gap-2">
                      <ExclamationTriangleIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-yellow-800 dark:text-yellow-300">
                        <strong>Warning:</strong> This action cannot be undone. All data associated with this note will be permanently deleted.
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl text-center">
                  <p className="text-gray-600 dark:text-slate-400">
                    Note not found or already deleted.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !deletionPlan?.found}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              {loading ? 'Loading...' : 'Delete Permanently'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
