'use client'

import React, { useState } from 'react'
import ModernLayout from './layout/ModernLayout'
import { AuthProvider } from '../contexts/AuthContext'
import { ThemeProvider } from '../contexts/ThemeContext'

const TestApp: React.FC = () => {
  const [activeView, setActiveView] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="h-screen bg-gray-50 dark:bg-slate-900">
          <ModernLayout
            activeView={activeView}
            onViewChange={setActiveView}
            sidebarOpen={sidebarOpen}
            onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
          />
        </div>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default TestApp
