'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { 
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  ArrowsPointingOutIcon,
  PlayIcon,
  PauseIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { 
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 animate-pulse rounded-xl flex items-center justify-center">
    <div className="text-gray-500">Loading Knowledge Graph...</div>
  </div>
})

interface Node {
  id: string
  name: string
  type: 'document' | 'concept' | 'person' | 'organization' | 'topic'
  size: number
  color: string
  connections: number
  description?: string
}

interface Link {
  source: string
  target: string
  value: number
  type: 'citation' | 'similarity' | 'co-occurrence' | 'hierarchy'
}

interface GraphData {
  nodes: Node[]
  links: Link[]
}

const NodeDetailsPanel = ({ node, onClose }: { node: Node | null, onClose: () => void }) => {
  if (!node) return null

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className="absolute top-4 right-4 w-80 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 p-6 z-10"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-4 h-4 rounded-full`} style={{ backgroundColor: node.color }} />
          <div>
            <h3 className="font-semibold text-gray-900">{node.name}</h3>
            <p className="text-sm text-gray-500 capitalize">{node.type}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          ×
        </button>
      </div>
      
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Connections</label>
          <p className="text-lg font-semibold text-gray-900">{node.connections}</p>
        </div>
        
        {node.description && (
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</label>
            <p className="text-sm text-gray-700 leading-relaxed">{node.description}</p>
          </div>
        )}
        
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Relevance Score</label>
          <div className="flex items-center space-x-2 mt-1">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(node.size / 20) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700">{Math.round((node.size / 20) * 100)}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

const ControlPanel = ({ 
  onSearch, 
  onFilter, 
  onZoomFit, 
  isPaused, 
  onTogglePause,
  searchTerm,
  onSearchChange
}: {
  onSearch: (term: string) => void
  onFilter: (type: string) => void
  onZoomFit: () => void
  isPaused: boolean
  onTogglePause: () => void
  searchTerm: string
  onSearchChange: (term: string) => void
}) => (
  <motion.div
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    className="absolute top-4 left-4 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 p-4 z-10"
  >
    <div className="flex items-center space-x-3">
      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && onSearch(searchTerm)}
          className="pl-10 pr-4 py-2 w-48 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white/70"
        />
      </div>

      {/* Filter */}
      <select
        onChange={(e) => onFilter(e.target.value)}
        className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white/70"
      >
        <option value="">All Types</option>
        <option value="document">Documents</option>
        <option value="concept">Concepts</option>
        <option value="person">People</option>
        <option value="organization">Organizations</option>
        <option value="topic">Topics</option>
      </select>

      {/* Controls */}
      <div className="flex items-center space-x-2">
        <button
          onClick={onTogglePause}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title={isPaused ? "Resume animation" : "Pause animation"}
        >
          {isPaused ? (
            <PlayIcon className="h-4 w-4 text-gray-600" />
          ) : (
            <PauseIcon className="h-4 w-4 text-gray-600" />
          )}
        </button>
        
        <button
          onClick={onZoomFit}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="Fit to screen"
        >
          <ArrowsPointingOutIcon className="h-4 w-4 text-gray-600" />
        </button>
      </div>
    </div>
  </motion.div>
)

export default function KnowledgeGraphVisualizer() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] })
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [isPaused, setIsPaused] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const graphRef = useRef<any>(null)

  // Generate sample graph data
  useEffect(() => {
    const generateGraphData = (): GraphData => {
      const nodeTypes = ['document', 'concept', 'person', 'organization', 'topic'] as const
      const nodeColors = {
        document: '#3B82F6',
        concept: '#10B981', 
        person: '#F59E0B',
        organization: '#EF4444',
        topic: '#8B5CF6'
      }

      const nodes: Node[] = [
        { id: '1', name: 'Machine Learning', type: 'concept', size: 20, color: nodeColors.concept, connections: 15, description: 'Core AI concept with multiple applications' },
        { id: '2', name: 'Neural Networks', type: 'concept', size: 18, color: nodeColors.concept, connections: 12, description: 'Deep learning foundation' },
        { id: '3', name: 'Research Paper: Deep Learning', type: 'document', size: 16, color: nodeColors.document, connections: 8, description: 'Comprehensive overview of deep learning techniques' },
        { id: '4', name: 'Data Science', type: 'topic', size: 15, color: nodeColors.topic, connections: 10 },
        { id: '5', name: 'Python Programming', type: 'concept', size: 14, color: nodeColors.concept, connections: 9 },
        { id: '6', name: 'TensorFlow', type: 'concept', size: 12, color: nodeColors.concept, connections: 7 },
        { id: '7', name: 'OpenAI', type: 'organization', size: 13, color: nodeColors.organization, connections: 6 },
        { id: '8', name: 'Artificial Intelligence', type: 'concept', size: 19, color: nodeColors.concept, connections: 14 },
        { id: '9', name: 'Computer Vision', type: 'concept', size: 11, color: nodeColors.concept, connections: 5 },
        { id: '10', name: 'Natural Language Processing', type: 'concept', size: 17, color: nodeColors.concept, connections: 11 },
        { id: '11', name: 'Geoffrey Hinton', type: 'person', size: 10, color: nodeColors.person, connections: 4, description: 'Pioneer in deep learning research' },
        { id: '12', name: 'Transformers Architecture', type: 'document', size: 13, color: nodeColors.document, connections: 8 },
        { id: '13', name: 'GPT Models', type: 'concept', size: 15, color: nodeColors.concept, connections: 9 },
        { id: '14', name: 'Reinforcement Learning', type: 'concept', size: 12, color: nodeColors.concept, connections: 6 },
        { id: '15', name: 'Ethics in AI', type: 'topic', size: 8, color: nodeColors.topic, connections: 3 }
      ]

      const links: Link[] = [
        { source: '1', target: '2', value: 5, type: 'hierarchy' },
        { source: '1', target: '8', value: 8, type: 'similarity' },
        { source: '2', target: '3', value: 6, type: 'citation' },
        { source: '1', target: '4', value: 4, type: 'co-occurrence' },
        { source: '5', target: '6', value: 7, type: 'co-occurrence' },
        { source: '7', target: '13', value: 6, type: 'hierarchy' },
        { source: '8', target: '9', value: 5, type: 'hierarchy' },
        { source: '8', target: '10', value: 6, type: 'hierarchy' },
        { source: '11', target: '2', value: 4, type: 'citation' },
        { source: '12', target: '13', value: 8, type: 'similarity' },
        { source: '10', target: '13', value: 7, type: 'co-occurrence' },
        { source: '1', target: '14', value: 3, type: 'similarity' },
        { source: '8', target: '15', value: 5, type: 'co-occurrence' },
        { source: '3', target: '12', value: 6, type: 'citation' },
        { source: '9', target: '1', value: 4, type: 'hierarchy' }
      ]

      return { nodes, links }
    }

    setTimeout(() => {
      setGraphData(generateGraphData())
      setIsLoading(false)
    }, 1000)
  }, [])

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node)
  }, [])

  const handleSearch = useCallback((term: string) => {
    if (graphRef.current && term) {
      const foundNode = graphData.nodes.find(node => 
        node.name.toLowerCase().includes(term.toLowerCase())
      )
      if (foundNode) {
        // Cast to any to access position properties that may be added by the graph library
        const nodeWithPosition = foundNode as any
        if (nodeWithPosition.x && nodeWithPosition.y) {
          graphRef.current.centerAt(nodeWithPosition.x, nodeWithPosition.y, 1000)
          graphRef.current.zoom(8, 1000)
        }
        setSelectedNode(foundNode)
      }
    }
  }, [graphData.nodes, graphRef])

  const handleFilter = useCallback((type: string) => {
    setFilterType(type)
    // Implement filtering logic here
  }, [])

  const handleZoomFit = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400)
    }
  }, [graphRef])

  const filteredData = React.useMemo(() => {
    if (!filterType) return graphData
    
    const filteredNodes = graphData.nodes.filter(node => node.type === filterType)
    const nodeIds = new Set(filteredNodes.map(n => n.id))
    const filteredLinks = graphData.links.filter(link => 
      nodeIds.has(link.source.toString()) && nodeIds.has(link.target.toString())
    )
    
    return { nodes: filteredNodes, links: filteredLinks }
  }, [graphData, filterType])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50/30">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading Knowledge Graph...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="relative h-full bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-2xl overflow-hidden">
      <ControlPanel
        onSearch={handleSearch}
        onFilter={handleFilter}
        onZoomFit={handleZoomFit}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(!isPaused)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      <NodeDetailsPanel 
        node={selectedNode} 
        onClose={() => setSelectedNode(null)} 
      />

      {/* Graph Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-xl rounded-xl shadow-lg border border-gray-200/50 p-4 z-10"
      >
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full" />
            <span className="text-gray-600">{filteredData.nodes.length} nodes</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-400 rounded-full" />
            <span className="text-gray-600">{filteredData.links.length} connections</span>
          </div>
        </div>
      </motion.div>

      {/* Legend */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-xl rounded-xl shadow-lg border border-gray-200/50 p-4 z-10"
      >
        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
          <InformationCircleIcon className="h-4 w-4 mr-2" />
          Node Types
        </h4>
        <div className="space-y-2 text-sm">
          {[
            { type: 'document', color: '#3B82F6', label: 'Documents' },
            { type: 'concept', color: '#10B981', label: 'Concepts' },
            { type: 'person', color: '#F59E0B', label: 'People' },
            { type: 'organization', color: '#EF4444', label: 'Organizations' },
            { type: 'topic', color: '#8B5CF6', label: 'Topics' }
          ].map(({ type, color, label }) => (
            <div key={type} className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: color } as React.CSSProperties} 
              />
              <span className="text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Force Graph */}
      <ForceGraph2D
        ref={graphRef}
        graphData={filteredData}
        nodeId="id"
        nodeLabel="name"
        nodeVal="size"
        nodeColor="color"
        linkSource="source"
        linkTarget="target"
        linkColor={() => '#94A3B8'}
        linkWidth={(link: any) => Math.sqrt(link.value)}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D) => {
          const label = node.name
          const fontSize = Math.max(8, node.size / 3)
          ctx.font = `${fontSize}px Inter, sans-serif`
          
          // Draw node
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.size / 2, 0, 2 * Math.PI, false)
          ctx.fillStyle = node.color
          ctx.fill()
          
          // Draw border
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 2
          ctx.stroke()
          
          // Draw label
          const textWidth = ctx.measureText(label).width
          const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2)
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
          ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y + node.size / 2 + 2, bckgDimensions[0], bckgDimensions[1])
          
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#374151'
          ctx.fillText(label, node.x, node.y + node.size / 2 + fontSize * 0.6)
        }}
        onNodeClick={handleNodeClick}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        cooldownTicks={isPaused ? 0 : 100}
        warmupTicks={100}
        width={window?.innerWidth || 800}
        height={window?.innerHeight || 600}
      />
    </div>
  )
}
