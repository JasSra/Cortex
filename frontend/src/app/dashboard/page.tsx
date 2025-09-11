'use client'

import ModernDashboard from '@/components/dashboard/ModernDashboard'
import WelcomePage from '@/components/pages/WelcomePage'
import { useAuth } from '@/contexts/AuthContext'

export default function DashboardPage() {
  const { recentAuthEvent } = useAuth()
  
  if (recentAuthEvent) {
    // Show Welcome immediately after fresh login/signup
    return <WelcomePage />
  }
  
  return <ModernDashboard />
}
