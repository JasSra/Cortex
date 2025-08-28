'use client'

import React, { useEffect, useState } from 'react'

interface GraphNode {
  id: string
  label: string
  type: string
  frequency: number
  lastSeen: string
}

interface GraphEdge {
  id: string
  from: string
  to: string
  relationship: string
  confidence: number
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  totalNodes: number
  totalEdges: number
}

export default function MindMapPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedEntity, setSelectedEntity] = useState<string>('')
  const [entityTypes, setEntityTypes] = useState<string[]>([])

  useEffect(() => {
    fetchGraphData()
  }, [selectedEntity, entityTypes])

  const fetchGraphData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedEntity) params.append('focus', selectedEntity)
      entityTypes.forEach(type => params.append('entityTypes', type))
      
      const response = await fetch(`/api/graph?${params}`)
      if (!response.ok) throw new Error('Failed to fetch graph data')
      
      const data = await response.json()
      setGraphData(data)
    } catch (error) {
      console.error('Error fetching graph data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEntityTypeToggle = (type: string) => {
    setEntityTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const availableTypes = ['PERSON', 'ORGANIZATION', 'LOCATION', 'PROJECT', 'ID']

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Entity Mind Map</h1>
          <p className="text-gray-600">
            Explore relationships between entities in your knowledge base
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Focus Entity
              </label>
              <input
                type="text"
                value={selectedEntity}
                onChange={(e) => setSelectedEntity(e.target.value)}
                placeholder="Enter entity name to focus on..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entity Types
              </label>
              <div className="flex flex-wrap gap-2">
                {availableTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => handleEntityTypeToggle(type)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      entityTypes.includes(type)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Actions
              </label>
              <button
                onClick={fetchGraphData}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Graph Display */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading entity graph...</p>
              </div>
            </div>
          ) : graphData ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Entity Graph</h2>
                <div className="text-sm text-gray-600">
                  {graphData.totalNodes} entities • {graphData.totalEdges} connections
                </div>
              </div>

              {/* Simple list view for now - can be enhanced with actual graph visualization */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Nodes */}
                <div>
                  <h3 className="font-medium mb-3">Entities</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {graphData.nodes.map(node => (
                      <div 
                        key={node.id}
                        className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{node.label}</div>
                            <div className="text-sm text-gray-600">
                              {node.type} • Frequency: {node.frequency}
                            </div>
                          </div>
                          <button
                            onClick={() => setSelectedEntity(node.label)}
                            className="text-blue-500 hover:text-blue-700 text-sm"
                          >
                            Focus
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Edges */}
                <div>
                  <h3 className="font-medium mb-3">Relationships</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {graphData.edges.map(edge => {
                      const fromNode = graphData.nodes.find(n => n.id === edge.from)
                      const toNode = graphData.nodes.find(n => n.id === edge.to)
                      return (
                        <div 
                          key={edge.id}
                          className="p-3 border border-gray-200 rounded-lg"
                        >
                          <div className="text-sm">
                            <span className="font-medium">{fromNode?.label}</span>
                            <span className="mx-2 text-gray-500">
                              —{edge.relationship}→
                            </span>
                            <span className="font-medium">{toNode?.label}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Confidence: {Math.round(edge.confidence * 100)}%
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Empty state */}
              {graphData.nodes.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-4xl mb-4">🔍</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No entities found</h3>
                  <p className="text-gray-600">
                    Try adjusting your filters or add some notes to build your knowledge graph.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-red-400 text-4xl mb-4">⚠️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load graph</h3>
              <p className="text-gray-600 mb-4">
                There was an error loading the entity graph. Please try again.
              </p>
              <button
                onClick={fetchGraphData}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">About the Mind Map</h3>
          <p className="text-blue-800 text-sm">
            This visualization shows entities extracted from your notes and their relationships. 
            Use the controls above to filter by entity type or focus on specific entities. 
            The graph updates automatically as you add more content to your knowledge base.
          </p>
        </div>
      </div>
    </div>
  )
}
