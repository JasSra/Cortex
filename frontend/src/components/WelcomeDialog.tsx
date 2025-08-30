"use client"

import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrophyIcon, InformationCircleIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { useGamificationApi } from '@/services/apiClient'

interface WelcomeDialogProps {
  open: boolean
  type: 'signup' | 'login'
  onClose: () => void
}

export const WelcomeDialog: React.FC<WelcomeDialogProps> = ({ open, type, onClose }) => {
  const { getAccessToken } = useAuth()
  const { getUserStats } = useGamificationApi()
  const [stats, setStats] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(false)

  useEffect(() => {
    const load = async () => {
      if (open && type === 'login') {
        setLoading(true)
        try {
          const data = await getUserStats()
          setStats(data)
        } catch (e) {
          console.error(e)
        } finally {
          setLoading(false)
        }
      }
    }
    load()
  }, [open, type, getUserStats])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="w-full max-w-lg mx-4 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                <SparklesIcon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl font-semibold">
                {type === 'signup' ? 'Welcome to Cortex!' : 'Welcome back!'}
              </h3>
            </div>

            {type === 'signup' ? (
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p>We're setting up some starter content to help you get going:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Sample notes and tags</li>
                  <li>Quick search examples</li>
                  <li>A few graph entities</li>
                </ul>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <InformationCircleIcon className="w-5 h-5 mt-0.5" />
                  <p>Explore the dashboard, try a search, or ask the chat assistant. You can upload your own documents anytime.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {loading ? (
                  <div className="flex items-center gap-2 text-slate-500">
                    <div className="h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    Loading your stats...
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats?.level ?? 1}</div>
                      <div className="text-xs">Level</div>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">{stats?.totalXp ?? 0}</div>
                      <div className="text-xs">XP</div>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{stats?.totalNotes ?? 0}</div>
                      <div className="text-xs">Notes</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <TrophyIcon className="w-5 h-5 text-amber-500" />
                  Keep exploring to unlock achievements!
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700"
              >
                Let's go
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default WelcomeDialog
