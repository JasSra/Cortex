'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { 
  DocumentTextIcon,
  ChatBubbleLeftIcon,
  MagnifyingGlassIcon,
  ShareIcon,
  ChartBarIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  UserGroupIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import { useGamificationApi, useNotesApi, useGraphApi } from '@/services/apiClient'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), { 
  ssr: false,
  loading: () => <div className="w-full h-64 bg-gray-100 animate-pulse rounded-xl" />
})

interface DashboardProps {
  stats?: {
    totalDocuments: number
    totalSearches: number
    totalChats: number
    totalConnections: number
    recentActivity: Array<{
      id: string
      type: string
      title: string
      timestamp: string
    }>
  }
}

const defaultStats = {
  totalDocuments: 0,
  totalSearches: 0,
  totalChats: 0,
  totalConnections: 0,
  recentActivity: [] as Array<{ id: string; type: string; title: string; timestamp: string }>,
}

const StatCard = ({ title, value, icon: Icon, trend, color }: {
  title: string
  value: number
  icon: any
  trend?: string
  color: string
}) => (
  <motion.div
    whileHover={{ scale: 1.05, y: -5 }}
    transition={{ type: "spring", stiffness: 300 }}
    className="bg-white/80 dark:bg-slate-800/70 backdrop-blur-lg rounded-3xl p-6 shadow-xl border border-white/20 dark:border-slate-700/40 hover:shadow-2xl transition-all duration-300 group"
  >
    <div className="flex items-center justify-between">
      <div className="flex-1">
  <p className="text-sm font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wide">{title}</p>
  <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 mt-2 group-hover:text-gray-700 transition-colors">
          {value.toLocaleString()}
        </p>
        {trend && (
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-emerald-600 mt-2 flex items-center font-medium"
          >
            <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
            {trend}
          </motion.p>
        )}
      </div>
      <div className={`p-4 rounded-2xl ${color} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="h-7 w-7 text-white" />
      </div>
    </div>
  </motion.div>
)

export default function ModernDashboard({ stats = defaultStats }: DashboardProps) {
  const { isAuthenticated } = useAuth()
  const { theme } = useTheme()
  const { getUserStats } = useGamificationApi()
  const { getNotes } = useNotesApi()
  const { getStatistics } = useGraphApi() as any
  const [live, setLive] = useState(defaultStats)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    if (!isAuthenticated) { setLoading(false); return }
    ;(async () => {
      try {
        setLoading(true)
        const [statsRes, notes, graphStats] = await Promise.all([
          getUserStats().catch(() => ({ totalSearches: 0 })),
          getNotes().catch(() => []),
          getStatistics().catch(() => ({})),
        ])
        if (!mounted) return
        const totalConnections = (() => {
          try {
            const vals = Object.values(graphStats || {})
            return vals.reduce((a: number, v: any) => a + (typeof v === 'number' ? v : 0), 0)
          } catch { return 0 }
        })()
        setLive({
          totalDocuments: Array.isArray(notes) ? notes.length : 0,
          totalSearches: statsRes.totalSearches ?? 0,
          totalChats: 0,
          totalConnections,
          recentActivity: [],
        })
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [isAuthenticated, getUserStats, getNotes, getStatistics])

  const viewStats = useMemo(() => ({
    totalDocuments: stats?.totalDocuments ?? live.totalDocuments,
    totalSearches: stats?.totalSearches ?? live.totalSearches,
    totalChats: stats?.totalChats ?? live.totalChats,
    totalConnections: stats?.totalConnections ?? live.totalConnections,
    recentActivity: stats?.recentActivity?.length ? stats.recentActivity : live.recentActivity,
  }), [stats, live])
  // Sample data for charts
  const chartsEnabled = false // Disable demo charts until real analytics endpoints exist
  const searchTrendsData = chartsEnabled ? {
    x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    y: [120, 135, 147, 162, 181, 156, 143],
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    line: { color: '#3B82F6', width: 3 },
    marker: { color: '#3B82F6', size: 8 },
    name: 'Searches'
  } : null

  const documentTypesData = chartsEnabled ? {
    values: [35, 25, 20, 15, 5],
    labels: ['PDFs', 'Text Files', 'Word Docs', 'Presentations', 'Other'],
    type: 'pie' as const,
    hole: 0.4,
    marker: {
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
    }
  } : null

  const knowledgeGrowthData = chartsEnabled ? [
    {
      x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      y: [245, 389, 567, 723, 891, 1247],
      type: 'bar' as const,
      marker: { color: '#3B82F6' },
      name: 'Documents'
    },
    {
      x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      y: [156, 278, 445, 634, 892, 1156],
      type: 'bar' as const,
      marker: { color: '#10B981' },
      name: 'Connections'
    }
  ] : []

  const plotConfig = {
    displayModeBar: false,
    responsive: true
  }

  const isDark = theme === 'dark'
  const plotLayout = {
    margin: { l: 40, r: 20, t: 30, b: 40 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, sans-serif', size: 12, color: isDark ? '#e5e7eb' : '#374151' },
    showlegend: false
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(59,130,246,0.1)_1px,transparent_0)] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(59,130,246,0.05)_1px,transparent_0)] bg-[length:24px_24px]" />
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-100/20 via-transparent to-purple-100/20 dark:from-blue-900/10 dark:to-purple-900/10" />
      
      <div className="relative z-10 p-6 space-y-8">
      {/* Header */}
      <div className="text-center mb-8">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2"
        >
          Welcome to Cortex
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-gray-600 dark:text-slate-300 text-lg"
        >
          Your intelligent knowledge management system
        </motion.p>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center mt-4"
        >
          <div className="bg-gradient-to-r from-blue-100 to-purple-100 px-4 py-2 rounded-full">
            <span className="text-sm font-medium text-blue-700">🎯 AI-Powered • 🚀 Real-time • ✨ Intelligent</span>
          </div>
        </motion.div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Documents"
          value={viewStats.totalDocuments}
          icon={DocumentTextIcon}
          trend="+12% this month"
          color="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <StatCard
          title="Searches"
          value={viewStats.totalSearches}
          icon={MagnifyingGlassIcon}
          trend="+8% this week"
          color="bg-gradient-to-br from-green-500 to-green-600"
        />
        <StatCard
          title="Chat Sessions"
          value={viewStats.totalChats}
          icon={ChatBubbleLeftIcon}
          trend="+24% this month"
          color="bg-gradient-to-br from-yellow-500 to-orange-500"
        />
        <StatCard
          title="Knowledge Connections"
          value={viewStats.totalConnections}
          icon={ShareIcon}
          trend="+18% this month"
          color="bg-gradient-to-br from-purple-500 to-purple-600"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search Trends */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/80 dark:bg-slate-800/70 backdrop-blur-lg rounded-3xl p-6 shadow-xl border border-white/20 dark:border-slate-700/40 hover:shadow-2xl transition-all duration-300"
        >
          <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
            <ChartBarIcon className="h-6 w-6 mr-3 text-blue-500" />
            Search Trends (Last 7 Days)
            <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Live</span>
          </h3>
          {chartsEnabled && searchTrendsData ? (
            <Plot
              data={[searchTrendsData]}
              layout={{
                ...plotLayout,
                height: 250,
                xaxis: { showgrid: false },
                yaxis: { showgrid: true, gridcolor: isDark ? '#334155' : '#f3f4f6' }
              }}
              config={plotConfig}
              className="w-full"
            />
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-gray-500 dark:text-slate-400">No trend data yet</div>
          )}
        </motion.div>

        {/* Document Types */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white/80 dark:bg-slate-800/70 backdrop-blur-lg rounded-3xl p-6 shadow-xl border border-white/20 dark:border-slate-700/40 hover:shadow-2xl transition-all duration-300"
        >
          <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
            <DocumentTextIcon className="h-6 w-6 mr-3 text-green-500" />
            Document Types
            <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Updated</span>
          </h3>
          {chartsEnabled && documentTypesData ? (
            <Plot
              data={[documentTypesData]}
              layout={{
                ...plotLayout,
                height: 250
              }}
              config={plotConfig}
              className="w-full"
            />
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-gray-500 dark:text-slate-400">No document type data yet</div>
          )}
        </motion.div>

        {/* Knowledge Growth */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white/80 dark:bg-slate-800/70 backdrop-blur-lg rounded-3xl p-6 shadow-xl border border-white/20 dark:border-slate-700/40 hover:shadow-2xl transition-all duration-300 lg:col-span-2"
        >
          <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
            <ArrowTrendingUpIcon className="h-6 w-6 mr-3 text-purple-500" />
            Knowledge Base Growth (Last 6 Months)
            <span className="ml-auto text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Trending ↗</span>
          </h3>
          {chartsEnabled && knowledgeGrowthData.length ? (
            <Plot
              data={knowledgeGrowthData}
              layout={{
                ...plotLayout,
                height: 300,
                barmode: 'group',
                showlegend: true,
                legend: { orientation: 'h', y: -0.2 },
                xaxis: { showgrid: false },
                yaxis: { showgrid: true, gridcolor: isDark ? '#334155' : '#f3f4f6' }
              }}
              config={plotConfig}
              className="w-full"
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-gray-500 dark:text-slate-400">No growth data yet</div>
          )}
        </motion.div>
      </div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white/80 dark:bg-slate-800/70 backdrop-blur-lg rounded-3xl p-8 shadow-xl border border-white/20 dark:border-slate-700/40"
      >
        <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-6 flex items-center">
          <ClockIcon className="h-6 w-6 mr-3 text-orange-500" />
          Recent Activity
          <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium">Real-time</span>
        </h3>
        <div className="space-y-4">
          {(viewStats.recentActivity || []).map((activity, index) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index }}
              className="flex items-center space-x-4 p-4 rounded-2xl hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50 transition-all duration-300 group cursor-pointer border border-transparent hover:border-blue-200"
            >
              <div className={`p-3 rounded-xl shadow-sm group-hover:scale-110 transition-transform duration-300 ${
                activity.type === 'document' ? 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600' :
                activity.type === 'search' ? 'bg-gradient-to-br from-green-100 to-green-200 text-green-600' :
                activity.type === 'chat' ? 'bg-gradient-to-br from-yellow-100 to-orange-200 text-orange-600' :
                activity.type === 'achievement' ? 'bg-gradient-to-br from-amber-100 to-yellow-200 text-amber-600' :
                'bg-gradient-to-br from-purple-100 to-purple-200 text-purple-600'
              }`}>
                {activity.type === 'document' && <DocumentTextIcon className="h-5 w-5" />}
                {activity.type === 'search' && <MagnifyingGlassIcon className="h-5 w-5" />}
                {activity.type === 'chat' && <ChatBubbleLeftIcon className="h-5 w-5" />}
                {activity.type === 'graph' && <ShareIcon className="h-5 w-5" />}
                {activity.type === 'achievement' && <SparklesIcon className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-slate-100 group-hover:text-blue-700 transition-colors">{activity.title}</p>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{activity.timestamp}</p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="text-sm text-gray-500 dark:text-slate-400">Loading activity…</div>
          )}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <motion.button 
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          className="bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <DocumentTextIcon className="h-10 w-10 mb-3 group-hover:scale-110 transition-transform duration-300" />
          <h4 className="font-bold text-lg mb-2">Upload Document</h4>
          <p className="text-sm opacity-90">AI extracts entities and builds knowledge graph</p>
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">✨ AI Powered</span>
          </div>
        </motion.button>
        
        <motion.button 
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          className="bg-gradient-to-br from-emerald-500 via-green-600 to-teal-700 text-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <ChatBubbleLeftIcon className="h-10 w-10 mb-3 group-hover:scale-110 transition-transform duration-300" />
          <h4 className="font-bold text-lg mb-2">AI Assistant</h4>
          <p className="text-sm opacity-90">Voice-enabled chat with your knowledge</p>
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">🎤 Voice Ready</span>
          </div>
        </motion.button>
        
        <motion.button 
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          className="bg-gradient-to-br from-purple-500 via-violet-600 to-indigo-700 text-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <ShareIcon className="h-10 w-10 mb-3 group-hover:scale-110 transition-transform duration-300" />
          <h4 className="font-bold text-lg mb-2">Knowledge Graph</h4>
          <p className="text-sm opacity-90">3D visualization of connections</p>
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">🌐 3D View</span>
          </div>
        </motion.button>
      </motion.div>

      {/* AI Features Showcase */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20 backdrop-blur-sm" />
        <div className="relative z-10">
          <motion.h3 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 }}
            className="text-2xl font-bold mb-6 flex items-center"
          >
            <SparklesIcon className="h-8 w-8 mr-3 animate-pulse" />
            AI-Powered Features
          </motion.h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { emoji: '🎯', title: 'Smart Classification', desc: 'Auto-categorizes your content', delay: 0.9 },
              { emoji: '🔍', title: 'Semantic Search', desc: 'Find by meaning, not just keywords', delay: 1.0 },
              { emoji: '🤖', title: 'Voice Commands', desc: 'Talk to your knowledge base', delay: 1.1 },
              { emoji: '�', title: 'Gamification', desc: 'Earn XP and unlock achievements', delay: 1.2 }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: feature.delay }}
                className="bg-white/15 rounded-2xl p-6 backdrop-blur-sm hover:bg-white/25 transition-all duration-300 group cursor-pointer"
              >
                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-300">
                  {feature.emoji}
                </div>
                <h4 className="font-bold mb-2 text-lg">{feature.title}</h4>
                <p className="text-sm opacity-90">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
        
        {/* Floating decorative elements */}
        <div className="absolute top-4 right-4 w-16 h-16 bg-white/10 rounded-full animate-bounce delay-1000" />
        <div className="absolute bottom-4 left-4 w-12 h-12 bg-white/5 rounded-full animate-bounce delay-2000" />
        <div className="absolute top-1/2 right-8 w-8 h-8 bg-white/10 rounded-full animate-ping delay-3000" />
      </motion.div>
      </div>
    </div>
  )
}
