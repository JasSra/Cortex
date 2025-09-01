'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface ProgressDialogProps {
  isOpen: boolean
  onClose?: () => void
  title: string
  message: string
  progress?: number // 0-100, undefined for indeterminate
  canCancel?: boolean
  showProgress?: boolean
}

export default function ProgressDialog({
  isOpen,
  onClose,
  title,
  message,
  progress,
  canCancel = false,
  showProgress = true
}: ProgressDialogProps) {
  const isIndeterminate = progress === undefined

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6 relative"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h3>
              {canCancel && onClose && (
                <button
                  onClick={onClose}
                  title="Close dialog"
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              )}
            </div>

            {/* Message */}
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              {message}
            </p>

            {/* Progress Bar */}
            {showProgress && (
              <div className="mb-4">
                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                  {isIndeterminate ? (
                    <motion.div
                      className="h-2 bg-purple-600 rounded-full"
                      animate={{
                        x: ['-100%', '100%'],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      style={{
                        width: '40%',
                        position: 'relative',
                      }}
                    />
                  ) : (
                    <motion.div
                      className="h-2 bg-purple-600 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                </div>
                {!isIndeterminate && (
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>{progress}%</span>
                    <span>Complete</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {canCancel && onClose && (
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
