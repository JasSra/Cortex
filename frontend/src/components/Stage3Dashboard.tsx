'use client'

import React, { useState, useEffect } from 'react'

interface GraphHealth {
  status: string
  entities: number
  relationships: number
  density: number
  connectivity: number
  isolatedEntities: number
  topEntityTypes: { [key: string]: number }
  lastAnalyzed: string
}

interface DailyDigest {
  date: string
  summary: string
  recentActivity: {
    notesCreated: number
    topCategories: Array<{ category: string; count: number }>
    trendingEntities: Array<{ entityType: string; count: number; trendDirection: string }>
  }
  keyInsights: string[]
  proactiveSuggestions: Array<{
    type: string
    title: string
    description: string
    priority: string
    estimatedTimeMinutes: number
  }>
}

interface RelationshipDiscovery {
  discovered: number
  message: string
}

export default function Stage3Dashboard() {
  const [graphHealth, setGraphHealth] = useState<GraphHealth | null>(null)
  const [dailyDigest, setDailyDigest] = useState<DailyDigest | null>(null)
  const [discoveryResults, setDiscoveryResults] = useState<{[key: string]: RelationshipDiscovery}>({})
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const fetchGraphHealth = async () => {
    try {
      const response = await fetch('/api/graph/health')
      if (response.ok) {
        const data = await response.json()
        setGraphHealth(data)
      }
    } catch (error) {
      console.error('Error fetching graph health:', error)
    }
  }

  const fetchDailyDigest = async () => {
    try {
      const response = await fetch('/api/suggestions/digest/today')
      if (response.ok) {
        const data = await response.json()
        setDailyDigest(data)
      }
    } catch (error) {
      console.error('Error fetching daily digest:', error)
    }
  }

  const runRelationshipDiscovery = async (type: string) => {
    setIsDiscovering(true)
    try {
      const response = await fetch(`/api/graph/discover/${type}`, { method: 'POST' })
      if (response.ok) {
        const data = await response.json()
        setDiscoveryResults(prev => ({ ...prev, [type]: data }))
      }
    } catch (error) {
      console.error(`Error running ${type} discovery:`, error)
    } finally {
      setIsDiscovering(false)
    }
  }

  const runAllDiscovery = async () => {
    setIsDiscovering(true)
    try {
      const response = await fetch('/api/graph/discover/all', { method: 'POST' })
      if (response.ok) {
        const data = await response.json()
        setDiscoveryResults(prev => ({ ...prev, all: data }))
        // Refresh graph health after discovery
        await fetchGraphHealth()
      }
    } catch (error) {
      console.error('Error running comprehensive discovery:', error)
    } finally {
      setIsDiscovering(false)
    }
  }

  useEffect(() => {
    fetchGraphHealth()
    fetchDailyDigest()
  }, [])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50'
      case 'medium': return 'text-yellow-600 bg-yellow-50'
      case 'low': return 'text-green-600 bg-green-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="border-b border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Stage 3: Advanced Intelligence Dashboard</h1>
        <nav className="flex space-x-8">
          {['overview', 'relationships', 'insights', 'discovery'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Graph Health */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Knowledge Graph Health</h2>
            {graphHealth ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`px-2 py-1 rounded text-sm ${
                    graphHealth.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {graphHealth.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Entities:</span>
                  <span className="font-medium">{graphHealth.entities.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Relationships:</span>
                  <span className="font-medium">{graphHealth.relationships.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Connectivity:</span>
                  <span className="font-medium">{(graphHealth.connectivity * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Graph Density:</span>
                  <span className="font-medium">{(graphHealth.density * 100).toFixed(4)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Isolated Entities:</span>
                  <span className="font-medium">{graphHealth.isolatedEntities}</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Last analyzed: {formatDate(graphHealth.lastAnalyzed)}
                </div>
              </div>
            ) : (
              <div className="text-gray-500">Loading graph health...</div>
            )}
          </div>

          {/* Daily Digest */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Today's Intelligence Digest</h2>
            {dailyDigest ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900">Summary</h3>
                  <p className="text-sm text-gray-600 mt-1">{dailyDigest.summary}</p>
                </div>
                
                <div>
                  <h3 className="font-medium text-gray-900">Recent Activity</h3>
                  <div className="mt-2 space-y-1">
                    <div className="text-sm">
                      <span className="text-gray-600">Notes created:</span>
                      <span className="ml-2 font-medium">{dailyDigest.recentActivity.notesCreated}</span>
                    </div>
                    {dailyDigest.recentActivity.topCategories.slice(0, 3).map((cat, index) => (
                      <div key={index} className="text-sm">
                        <span className="text-gray-600">{cat.category}:</span>
                        <span className="ml-2 font-medium">{cat.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {dailyDigest.keyInsights.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900">Key Insights</h3>
                    <ul className="mt-2 space-y-1">
                      {dailyDigest.keyInsights.slice(0, 3).map((insight, index) => (
                        <li key={index} className="text-sm text-gray-600">• {insight}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500">Loading daily digest...</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'relationships' && dailyDigest && (
        <div className="space-y-6">
          {/* Proactive Suggestions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Proactive Suggestions</h2>
            {dailyDigest.proactiveSuggestions.length > 0 ? (
              <div className="space-y-3">
                {dailyDigest.proactiveSuggestions.map((suggestion, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{suggestion.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{suggestion.description}</p>
                        <div className="mt-2 flex items-center space-x-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(suggestion.priority)}`}>
                            {suggestion.priority} priority
                          </span>
                          <span className="text-xs text-gray-500">
                            ~{suggestion.estimatedTimeMinutes} min
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500">No suggestions available at this time.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'discovery' && (
        <div className="space-y-6">
          {/* Relationship Discovery */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Relationship Discovery</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <button
                onClick={() => runRelationshipDiscovery('co-occurrence')}
                disabled={isDiscovering}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <h3 className="font-medium">Co-occurrence</h3>
                <p className="text-sm text-gray-600">Find entities appearing together</p>
              </button>
              <button
                onClick={() => runRelationshipDiscovery('semantic')}
                disabled={isDiscovering}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <h3 className="font-medium">Semantic</h3>
                <p className="text-sm text-gray-600">Find similar entities</p>
              </button>
              <button
                onClick={() => runRelationshipDiscovery('temporal')}
                disabled={isDiscovering}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <h3 className="font-medium">Temporal</h3>
                <p className="text-sm text-gray-600">Find time-based patterns</p>
              </button>
              <button
                onClick={runAllDiscovery}
                disabled={isDiscovering}
                className="p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <h3 className="font-medium">Run All</h3>
                <p className="text-sm text-blue-100">Comprehensive analysis</p>
              </button>
            </div>

            {isDiscovering && (
              <div className="text-center py-4">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600 mt-2">Discovering relationships...</p>
              </div>
            )}

            {Object.keys(discoveryResults).length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium">Discovery Results</h3>
                {Object.entries(discoveryResults).map(([type, result]) => (
                  <div key={type} className="p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-center">
                      <span className="font-medium capitalize">{type}</span>
                      <span className="text-sm text-gray-600">
                        {result.discovered} relationships discovered
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{result.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'insights' && graphHealth && (
        <div className="space-y-6">
          {/* Entity Type Distribution */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Entity Type Distribution</h2>
            {Object.keys(graphHealth.topEntityTypes).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(graphHealth.topEntityTypes)
                  .sort(([,a], [,b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="flex justify-between items-center">
                      <span className="text-gray-700 capitalize">{type}</span>
                      <div className="flex items-center space-x-2">
                        <div className="bg-gray-200 rounded-full h-2 w-32">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{
                              width: `${Math.min((count / Math.max(...Object.values(graphHealth.topEntityTypes))) * 100, 100)}%`
                            }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium w-8 text-right">{count}</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-gray-500">No entity data available</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
