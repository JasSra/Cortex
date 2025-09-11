'use client'

import AnalyticsPage from '@/components/pages/AnalyticsPage'
import WelcomePage from '@/components/pages/WelcomePage'
import { useAuth } from '@/contexts/AuthContext'

export default function AnalyticsPageRoute() {
  const { recentAuthEvent } = useAuth()
  
  if (recentAuthEvent) {
    // Show Welcome immediately after fresh login/signup
    return <WelcomePage />
  }
  
  return <AnalyticsPage />
}
