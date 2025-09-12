'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to workspace by default for logged in users
    router.replace('/workspace')
  }, [router])

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 shadow-lg">
          <svg className="animate-spin w-6 h-6 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Redirecting...</h2>
        <p className="text-slate-600 dark:text-slate-400">Setting up your personal knowledge hub...</p>
      </div>
    </div>
  )
}
