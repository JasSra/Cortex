'use client'

import React from 'react'
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
  UserGroupIcon
} from '@heroicons/react/24/outline'

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
  totalDocuments: 1247,
  totalSearches: 8392,
  totalChats: 456,
  totalConnections: 2847,
  recentActivity: [
    { id: '1', type: 'document', title: 'New document uploaded: Research Paper.pdf', timestamp: '2 minutes ago' },
    { id: '2', type: 'search', title: 'Search: "machine learning algorithms"', timestamp: '5 minutes ago' },
    { id: '3', type: 'chat', title: 'Chat session: Code review discussion', timestamp: '12 minutes ago' },
    { id: '4', type: 'graph', title: 'New connection discovered: AI → Neural Networks', timestamp: '18 minutes ago' },
  ]
}

const StatCard = ({ title, value, icon: Icon, trend, color }: {
  title: string
  value: number
  icon: any
  trend?: string
  color: string
}) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-gray-200/50"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">
          {value.toLocaleString()}
        </p>
        {trend && (
          <p className="text-sm text-green-600 mt-1 flex items-center">
            <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
            {trend}
          </p>
        )}
      </div>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
    </div>
  </motion.div>
)

export default function ModernDashboard({ stats = defaultStats }: DashboardProps) {
  // Sample data for charts
  const searchTrendsData = {
    x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    y: [120, 135, 147, 162, 181, 156, 143],
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    line: { color: '#3B82F6', width: 3 },
    marker: { color: '#3B82F6', size: 8 },
    name: 'Searches'
  }

  const documentTypesData = {
    values: [35, 25, 20, 15, 5],
    labels: ['PDFs', 'Text Files', 'Word Docs', 'Presentations', 'Other'],
    type: 'pie' as const,
    hole: 0.4,
    marker: {
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
    }
  }

  const knowledgeGrowthData = [
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
  ]

  const plotConfig = {
    displayModeBar: false,
    responsive: true
  }

  const plotLayout = {
    margin: { l: 40, r: 20, t: 30, b: 40 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, sans-serif', size: 12, color: '#374151' },
    showlegend: false
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent"
        >
          Welcome to Cortex
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-gray-600 mt-2"
        >
          Your intelligent knowledge management system
        </motion.p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Documents"
          value={stats.totalDocuments}
          icon={DocumentTextIcon}
          trend="+12% this month"
          color="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <StatCard
          title="Searches"
          value={stats.totalSearches}
          icon={MagnifyingGlassIcon}
          trend="+8% this week"
          color="bg-gradient-to-br from-green-500 to-green-600"
        />
        <StatCard
          title="Chat Sessions"
          value={stats.totalChats}
          icon={ChatBubbleLeftIcon}
          trend="+24% this month"
          color="bg-gradient-to-br from-yellow-500 to-orange-500"
        />
        <StatCard
          title="Knowledge Connections"
          value={stats.totalConnections}
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
          className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-gray-200/50"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <ChartBarIcon className="h-5 w-5 mr-2 text-blue-500" />
            Search Trends (Last 7 Days)
          </h3>
          <Plot
            data={[searchTrendsData]}
            layout={{
              ...plotLayout,
              height: 250,
              xaxis: { showgrid: false },
              yaxis: { showgrid: true, gridcolor: '#f3f4f6' }
            }}
            config={plotConfig}
            className="w-full"
          />
        </motion.div>

        {/* Document Types */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-gray-200/50"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <DocumentTextIcon className="h-5 w-5 mr-2 text-green-500" />
            Document Types
          </h3>
          <Plot
            data={[documentTypesData]}
            layout={{
              ...plotLayout,
              height: 250
            }}
            config={plotConfig}
            className="w-full"
          />
        </motion.div>

        {/* Knowledge Growth */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-gray-200/50 lg:col-span-2"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <ArrowTrendingUpIcon className="h-5 w-5 mr-2 text-purple-500" />
            Knowledge Base Growth (Last 6 Months)
          </h3>
          <Plot
            data={knowledgeGrowthData}
            layout={{
              ...plotLayout,
              height: 300,
              barmode: 'group',
              showlegend: true,
              legend: { orientation: 'h', y: -0.2 },
              xaxis: { showgrid: false },
              yaxis: { showgrid: true, gridcolor: '#f3f4f6' }
            }}
            config={plotConfig}
            className="w-full"
          />
        </motion.div>
      </div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-gray-200/50"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <ClockIcon className="h-5 w-5 mr-2 text-orange-500" />
          Recent Activity
        </h3>
        <div className="space-y-3">
          {stats.recentActivity.map((activity, index) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index }}
              className="flex items-center space-x-3 p-3 rounded-xl hover:bg-gray-50/70 transition-colors"
            >
              <div className={`p-2 rounded-lg ${
                activity.type === 'document' ? 'bg-blue-100 text-blue-600' :
                activity.type === 'search' ? 'bg-green-100 text-green-600' :
                activity.type === 'chat' ? 'bg-yellow-100 text-yellow-600' :
                'bg-purple-100 text-purple-600'
              }`}>
                {activity.type === 'document' && <DocumentTextIcon className="h-4 w-4" />}
                {activity.type === 'search' && <MagnifyingGlassIcon className="h-4 w-4" />}
                {activity.type === 'chat' && <ChatBubbleLeftIcon className="h-4 w-4" />}
                {activity.type === 'graph' && <ShareIcon className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                <p className="text-xs text-gray-500">{activity.timestamp}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <button className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105">
          <DocumentTextIcon className="h-8 w-8 mb-2" />
          <h4 className="font-semibold">Upload Document</h4>
          <p className="text-sm opacity-90 mt-1">Add new knowledge to your system</p>
        </button>
        
        <button className="bg-gradient-to-r from-green-500 to-green-600 text-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105">
          <ChatBubbleLeftIcon className="h-8 w-8 mb-2" />
          <h4 className="font-semibold">Start Chat</h4>
          <p className="text-sm opacity-90 mt-1">Ask questions about your data</p>
        </button>
        
        <button className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105">
          <ShareIcon className="h-8 w-8 mb-2" />
          <h4 className="font-semibold">Explore Graph</h4>
          <p className="text-sm opacity-90 mt-1">Discover knowledge connections</p>
        </button>
      </motion.div>
    </div>
  )
}
