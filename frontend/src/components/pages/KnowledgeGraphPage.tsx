'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  Squares2X2Icon,
  EyeIcon,
  AdjustmentsHorizontalIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  InformationCircleIcon,
  ShareIcon
} from '@heroicons/react/24/outline'
import { useMascot } from '@/contexts/MascotContext'
import { useGraphApi } from '@/services/apiClient'

interface GraphNode {
  id: string
  name: string
  type: string
  properties: Record<string, any>
  score?: number
  x?: number
  y?: number
  size?: number
  color?: string
}

interface GraphEdge {
  id: string
  source: string
  target: string
  type: string
  properties: Record<string, any>
  weight?: number
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  focus?: string
  depth: number
}

interface GraphFilters {
  entityTypes: string[]
  fromDate?: string
  toDate?: string
  minScore?: number
  maxDepth: number
}

const KnowledgeGraphPage: React.FC = () => {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [], depth: 2 })
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [filters, setFilters] = useState<GraphFilters>({
    entityTypes: [],
    maxDepth: 3,
    minScore: 0
  })
  const [availableEntityTypes, setAvailableEntityTypes] = useState<string[]>([])
  const [zoomLevel, setZoomLevel] = useState(1)
  
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const { speak, think, idle, suggest } = useMascot()
  const { getGraph, getConnectedEntities, getEntitySuggestions } = useGraphApi()

  // Load initial graph
  useEffect(() => {
    loadGraph()
  }, [])

  // Load graph data
  const loadGraph = useCallback(async (focus?: string) => {
    setIsLoading(true)
    think()

    try {
      const params = new URLSearchParams()
      if (focus) params.append('focus', focus)
      params.append('depth', filters.maxDepth.toString())
      if (filters.fromDate) params.append('fromDate', filters.fromDate)
      if (filters.toDate) params.append('toDate', filters.toDate)
      filters.entityTypes.forEach(type => params.append('entityTypes', type))

      const response: any = await getGraph(
        focus,
        parseInt(params.get('depth') || '2', 10),
        params.getAll('entityTypes'),
        params.get('fromDate') || undefined,
        params.get('toDate') || undefined
      )
      
      // Process and layout nodes
      const processedData = processGraphData(response)
      setGraphData(processedData)
      
      // Extract available entity types
      const nodeTypes = response.nodes?.map((n: GraphNode) => n.type) || []
      const uniqueTypes = Array.from(new Set(nodeTypes)) as string[]
      setAvailableEntityTypes(uniqueTypes)

      if (response.nodes?.length > 0) {
        speak(`Loaded ${response.nodes.length} entities and ${response.edges?.length || 0} relationships!`, 'responding')
      } else {
        speak("No entities found. Try uploading some documents first!", 'suggesting')
      }

    } catch (error) {
      console.error('Graph loading error:', error)
      speak("Failed to load the knowledge graph. Please try again.", 'error')
    } finally {
      setIsLoading(false)
      idle()
    }
  }, [filters, getGraph, speak, think, idle])

  // Process graph data for visualization
  const processGraphData = (data: any): GraphData => {
    const nodes = data.nodes || []
    const edges = data.edges || []
    
    // Calculate layout using force-directed algorithm (simplified)
    const processedNodes = nodes.map((node: GraphNode, index: number) => {
      const angle = (index / nodes.length) * 2 * Math.PI
      const radius = Math.min(300, 50 + nodes.length * 10)
      
      return {
        ...node,
        x: 400 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
        size: Math.max(20, Math.min(60, (node.score || 0.5) * 80)),
        color: getNodeColor(node.type)
      }
    })

    return {
      nodes: processedNodes,
      edges,
      focus: data.focus,
      depth: data.depth || 2
    }
  }

  // Get node color based on type
  const getNodeColor = (type: string): string => {
    const colors: Record<string, string> = {
      'person': '#3B82F6',    // blue
      'organization': '#10B981', // green
      'location': '#F59E0B',     // amber
      'concept': '#8B5CF6',      // purple
      'document': '#EF4444',     // red
      'event': '#EC4899',        // pink
      'technology': '#6366F1',   // indigo
      'project': '#14B8A6',      // teal
      'default': '#6B7280'       // gray
    }
    return colors[type.toLowerCase()] || colors.default
  }

  // Handle node click
  const handleNodeClick = async (node: GraphNode) => {
    setSelectedNode(node)
    speak(`Selected ${node.name}. Loading connected entities...`)
    
    try {
  const connectedEntities: any = await getConnectedEntities(node.id, 1)
      // You could expand the graph here or show related entities
      console.log('Connected entities:', connectedEntities)
    } catch (error) {
      console.error('Failed to load connected entities:', error)
    }
  }

  // Search entities
  const searchEntities = useCallback(async () => {
    if (!searchQuery.trim()) {
      suggest("Enter a search term to find specific entities in your knowledge graph!")
      return
    }

    setIsLoading(true)
    think()

    try {
      const params = new URLSearchParams({
        query: searchQuery
      })
      filters.entityTypes.forEach(type => params.append('types', type))

  const results: any = await getEntitySuggestions(searchQuery)
      
      if (results?.length > 0) {
        // Highlight found entities in the graph
        const foundIds = new Set(results.map((r: GraphNode) => r.id))
        const updatedNodes = graphData.nodes.map(node => ({
          ...node,
          highlighted: foundIds.has(node.id)
        }))
        
        setGraphData(prev => ({ ...prev, nodes: updatedNodes }))
        speak(`Found ${results.length} matching entities!`, 'responding')
      } else {
        speak("No matching entities found. Try different search terms.", 'suggesting')
      }

    } catch (error) {
      console.error('Search error:', error)
      speak("Search failed. Please try again.", 'error')
    } finally {
      setIsLoading(false)
      idle()
    }
  }, [searchQuery, filters.entityTypes, graphData.nodes, getEntitySuggestions, speak, think, idle, suggest])

  // Handle zoom
  const handleZoom = (delta: number) => {
    setZoomLevel(prev => Math.max(0.1, Math.min(3, prev + delta)))
  }

  // Get entity type statistics
  const getEntityStats = () => {
    const stats: Record<string, number> = {}
    graphData.nodes.forEach(node => {
      stats[node.type] = (stats[node.type] || 0) + 1
    })
    return stats
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Knowledge Graph
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Explore relationships between entities in your knowledge base
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchEntities()}
                placeholder="Search entities..."
                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode('2d')}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  viewMode === '2d'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                2D
              </button>
              <button
                onClick={() => setViewMode('3d')}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  viewMode === '3d'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                3D
              </button>
            </div>

            {/* Filters Toggle */}
            <motion.button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              whileHover={{ scale: 1.05 }}
            >
              <AdjustmentsHorizontalIcon className="w-4 h-4" />
            </motion.button>

            {/* Zoom Controls */}
            <div className="flex gap-1">
              <button
                onClick={() => handleZoom(0.1)}
                title="Zoom In"
                className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              >
                <ArrowsPointingOutIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleZoom(-0.1)}
                title="Zoom Out"
                className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              >
                <ArrowsPointingInIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="mt-4 flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
          <span>
            <strong>{graphData.nodes.length}</strong> entities
          </span>
          <span>
            <strong>{graphData.edges.length}</strong> relationships
          </span>
          <span>
            Depth: <strong>{graphData.depth}</strong>
          </span>
          {graphData.focus && (
            <span>
              Focus: <strong>{graphData.focus}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Filters Sidebar */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Filters
                </h3>
                
                {/* Entity Types */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Entity Types
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {availableEntityTypes.map(type => (
                      <label key={type} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={filters.entityTypes.includes(type)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFilters(prev => ({
                                ...prev,
                                entityTypes: [...prev.entityTypes, type]
                              }))
                            } else {
                              setFilters(prev => ({
                                ...prev,
                                entityTypes: prev.entityTypes.filter(t => t !== type)
                              }))
                            }
                          }}
                          className="mr-2"
                        />
                        <span 
                          className="text-sm capitalize font-medium"
                          style={{
                            color: getNodeColor(type)
                          }}
                        >
                          {type}
                        </span>
                        <span className="ml-auto text-xs text-gray-500">
                          {getEntityStats()[type] || 0}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Max Depth */}
                <div className="mb-6">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Max Depth: {filters.maxDepth}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={filters.maxDepth}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxDepth: parseInt(e.target.value) }))}
                    className="w-full"
                    aria-label="Maximum depth for graph traversal"
                  />
                </div>

                {/* Min Score */}
                <div className="mb-6">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Min Score: {filters.minScore?.toFixed(2) || '0.00'}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={filters.minScore || 0}
                    onChange={(e) => setFilters(prev => ({ ...prev, minScore: parseFloat(e.target.value) }))}
                    className="w-full"
                    aria-label="Minimum relevance score for entities"
                  />
                </div>

                <button
                  onClick={() => loadGraph()}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Graph Visualization */}
        <div className="flex-1 relative" ref={containerRef}>
          {isLoading && (
            <div className="absolute inset-0 bg-white dark:bg-gray-900 bg-opacity-75 flex items-center justify-center z-10">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full"
              />
            </div>
          )}

          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center'
            }}
          >
            {/* Edges */}
            <g>
              {graphData.edges.map(edge => {
                const sourceNode = graphData.nodes.find(n => n.id === edge.source)
                const targetNode = graphData.nodes.find(n => n.id === edge.target)
                
                if (!sourceNode || !targetNode) return null

                return (
                  <line
                    key={edge.id}
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke="#9CA3AF"
                    strokeWidth={Math.max(1, (edge.weight || 1) * 2)}
                    opacity={0.6}
                  />
                )
              })}
            </g>

            {/* Nodes */}
            <g>
              {graphData.nodes.map(node => (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.size}
                    fill={node.color}
                    stroke={selectedNode?.id === node.id ? '#7C3AED' : 'white'}
                    strokeWidth={selectedNode?.id === node.id ? 3 : 2}
                    opacity={(node as any).highlighted ? 1 : 0.8}
                    className="cursor-pointer hover:opacity-100"
                    onClick={() => handleNodeClick(node)}
                  />
                  <text
                    x={node.x}
                    y={node.y! + (node.size! + 15)}
                    textAnchor="middle"
                    className="text-xs fill-gray-700 dark:fill-gray-300 pointer-events-none"
                    fontSize="12"
                  >
                    {node.name.length > 15 ? node.name.substring(0, 15) + '...' : node.name}
                  </text>
                </g>
              ))}
            </g>
          </svg>

          {/* Node Details Panel */}
          <AnimatePresence>
            {selectedNode && (
              <motion.div
                initial={{ opacity: 0, x: 300 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 300 }}
                className="absolute top-4 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 max-w-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedNode.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                      {selectedNode.type}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    ×
                  </button>
                </div>

                {selectedNode.score && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Relevance Score</span>
                      <span className="font-medium">{(selectedNode.score * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
                      <div
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${selectedNode.score * 100}%`
                        }}
                      />
                    </div>
                  </div>
                )}

                {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Properties
                    </h4>
                    <div className="space-y-1 text-sm">
                      {Object.entries(selectedNode.properties).slice(0, 5).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400 capitalize">
                            {key}:
                          </span>
                          <span className="text-gray-900 dark:text-white font-medium">
                            {String(value).length > 20 ? String(value).substring(0, 20) + '...' : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => loadGraph(selectedNode.id)}
                    className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                  >
                    Focus Here
                  </button>
                  <button
                    onClick={() => handleNodeClick(selectedNode)}
                    title="Share Entity"
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg transition-colors"
                  >
                    <ShareIcon className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Legend */}
          {availableEntityTypes.length > 0 && (
            <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                Entity Types
              </h4>
              <div className="space-y-1">
                {availableEntityTypes.slice(0, 6).map(type => (
                  <div key={type} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: getNodeColor(type)
                      }}
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-300 capitalize">
                      {type} ({getEntityStats()[type] || 0})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default KnowledgeGraphPage
