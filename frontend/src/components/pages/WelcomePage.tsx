'use client'

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { SparklesIcon, InboxArrowDownIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { useSeedApi, useNotesApi } from '@/services/apiClient'
import { useAuth } from '@/contexts/AuthContext'

interface WelcomePageProps {
  onNavigate: (view: string) => void
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onNavigate }) => {
  const { isAuthenticated } = useAuth()
  const { seedIfNeeded } = useSeedApi()
  const notesApi = useNotesApi()
  const [hasData, setHasData] = useState<boolean | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    if (!isAuthenticated) return
    ;(async () => {
      try {
        const notes = await notesApi.getNotes()
        if (!mounted) return
        setHasData(Array.isArray(notes) && notes.length > 0)
      } catch {
        if (!mounted) return
        setHasData(false)
      }
    })()
    return () => { mounted = false }
  }, [isAuthenticated, notesApi])

  const onSeed = async () => {
    try {
      setSeeding(true)
      setMessage(null)
      await seedIfNeeded()
      setMessage('Demo data created. You can start exploring your notes!')
      setHasData(true)
    } catch (e) {
      setMessage('Seeding failed. Please try again from Settings later.')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white/70 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <SparklesIcon className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Welcome to Cortex</h1>
        </div>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          You’re signed in. Get started by ingesting your own content, or use demo data to explore features quickly.
        </p>

        {message && (
          <div className="mb-4 text-sm text-green-700 dark:text-green-300">{message}</div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('ingest')}
            className="flex items-center justify-center space-x-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-800 dark:text-slate-100"
          >
            <InboxArrowDownIcon className="h-5 w-5" />
            <span>Ingest my documents</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSeed}
            disabled={seeding}
            className="flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-3 disabled:opacity-70"
          >
            <SparklesIcon className="h-5 w-5" />
            <span>{seeding ? 'Seeding...' : 'Seed demo data'}</span>
          </motion.button>
        </div>

        <div className="mt-6 text-sm text-slate-600 dark:text-slate-400">
          Prefer to manage your account settings first? You can export or delete your data anytime.
        </div>
        <div className="mt-3">
          <button
            onClick={() => onNavigate('settings')}
            className="inline-flex items-center space-x-2 rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            <Cog6ToothIcon className="h-4 w-4" />
            <span>Open Settings</span>
          </button>
        </div>

        {hasData && (
          <div className="mt-6 text-sm text-slate-600 dark:text-slate-400">
            Looks like you already have notes. Jump into Search or Analytics anytime from the sidebar.
          </div>
        )}
      </div>
    </div>
  )
}

export default WelcomePage
