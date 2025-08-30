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
import { useGraphApi, useSearchApi } from '@/services/apiClient'

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
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null)
  const [relatedResults, setRelatedResults] = useState<any[] | null>(null)
  const [isCopying, setIsCopying] = useState(false)
  const loadingRef = useRef(false)
  
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const { speak, think, idle, suggest } = useMascot()
  const { getGraph, getConnectedEntities, discoverAll } = useGraphApi()
  const { searchGet } = useSearchApi()

  // Process graph data for visualization
  const processGraphData = useCallback((data: any): GraphData => {
    const rawNodes = Array.isArray(data?.nodes) ? data.nodes : []
    const rawEdges = Array.isArray(data?.edges) ? data.edges : []

    // Normalize backend -> UI node shape
    const normalizedNodes: GraphNode[] = rawNodes.map((n: any) => {
      const id = String(n?.id ?? n?.Id ?? '')
      const type = String(n?.type ?? n?.Type ?? 'concept')
      const name = String(n?.name ?? n?.Name ?? n?.value ?? n?.Value ?? id)
      const connectionCount = n?.connectionCount ?? n?.ConnectionCount
      const lastSeen = n?.lastSeen ?? n?.LastSeen
      return {
        id,
        name,
        type,
        properties: {
          connectionCount: typeof connectionCount === 'number' ? connectionCount : undefined,
          lastSeen: lastSeen ?? undefined,
        },
        score: typeof connectionCount === 'number' && connectionCount >= 0 ? Math.min(1, (connectionCount || 0) / 10) : 0.5,
      }
    })

    // Normalize backend -> UI edge shape
    const normalizedEdges: GraphEdge[] = rawEdges.map((e: any) => {
      const id = String(e?.id ?? e?.Id ?? `${e?.fromId ?? e?.FromId}-${e?.toId ?? e?.ToId}`)
      const source = String(e?.source ?? e?.Source ?? e?.fromId ?? e?.FromId ?? '')
      const target = String(e?.target ?? e?.Target ?? e?.toId ?? e?.ToId ?? '')
      const type = String(e?.type ?? e?.Type ?? e?.relationType ?? e?.RelationType ?? 'related')
      const confidence = e?.confidence ?? e?.Confidence
      return {
        id,
        source,
        target,
        type,
        properties: { confidence: confidence ?? undefined },
        weight: typeof confidence === 'number' ? Math.max(0.5, Math.min(2, confidence)) : 1,
      }
    })

    // Calculate a simple radial layout
    const processedNodes = normalizedNodes.map((node: GraphNode, index: number) => {
      const angle = (index / Math.max(1, normalizedNodes.length)) * 2 * Math.PI
      const radius = Math.min(300, 50 + normalizedNodes.length * 10)
      return {
        ...node,
        x: 400 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
        size: Math.max(20, Math.min(60, ((node as any).score || 0.5) * 80)),
        color: getNodeColor(node.type)
      }
    })

    return {
      nodes: processedNodes,
      edges: normalizedEdges,
      focus: data?.focus ?? data?.Focus,
      depth: data?.depth ?? data?.Depth ?? 2,
    }
  }, [])

  // Load graph data
  const loadGraph = useCallback(async (focus?: string) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoading(true)
    think()

    try {
      const depth = filters.maxDepth
      const types = filters.entityTypes
      const fromDate = filters.fromDate
      const toDate = filters.toDate

      const response: any = await getGraph(
        focus,
        depth,
        types,
        fromDate,
        toDate
      )
      
      // Process and layout nodes
      const processedData = processGraphData(response)
      setGraphData(processedData)
      
      // Extract available entity types
      const nodeTypes = processedData.nodes?.map((n: GraphNode) => n.type) || []
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
    loadingRef.current = false
    }
  }, [filters.maxDepth, filters.entityTypes, filters.fromDate, filters.toDate, getGraph, speak, think, idle, processGraphData])

  // Load initial graph (respect optional ?focus=<entityId> param)
  useEffect(() => {
    try {
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
      const focus = params.get('focus') || undefined
      loadGraph(focus || undefined)
    } catch {
      loadGraph()
    }
  }, [loadGraph])

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

  // Tailwind helper classes for text/bg based on type
  const getNodeTextClass = (type: string): string => {
    const map: Record<string, string> = {
      'person': 'text-blue-600',
      'organization': 'text-emerald-600',
      'location': 'text-amber-600',
      'concept': 'text-purple-600',
      'document': 'text-red-600',
      'event': 'text-pink-600',
      'technology': 'text-indigo-600',
      'project': 'text-teal-600',
      'default': 'text-gray-600'
    }
    return map[type.toLowerCase()] || map.default
  }

  const getNodeBgClass = (type: string): string => {
    const map: Record<string, string> = {
      'person': 'bg-blue-500',
      'organization': 'bg-emerald-500',
      'location': 'bg-amber-500',
      'concept': 'bg-purple-500',
      'document': 'bg-red-500',
      'event': 'bg-pink-500',
      'technology': 'bg-indigo-500',
      'project': 'bg-teal-500',
      'default': 'bg-gray-500'
    }
    return map[type.toLowerCase()] || map.default
  }

  // Handle node click
  const handleNodeClick = async (node: GraphNode) => {
    setSelectedNode(node)
    speak(`Selected ${node.name}. Loading connected entities...`)
    
    try {
      const connectedEntities: any = await getConnectedEntities(node.id, 1)
      // You could expand the graph here or show related entities
      // Preload related results panel for fast follow-up actions
      setRelatedResults(null)
      void fetchRelatedResults(node)
    } catch (error) {
      console.error('Failed to load connected entities:', error)
    }
  }

  // Expand graph by one hop from a node and merge into current graph
  const expandFromNode = useCallback(async (node: GraphNode) => {
    try {
      setIsLoading(true)
      think()
      const neighbors: any[] = await getConnectedEntities(node.id, 1)

      // Normalize to GraphNode[]
      const existingIds = new Set(graphData.nodes.map(n => n.id))
      const newNodes: GraphNode[] = (neighbors || [])
        .filter((n: any) => n && n.id && !existingIds.has(String(n.id)))
        .map((n: any, idx: number) => ({
          id: String(n.id),
          name: n.name ?? n.text ?? n.label ?? n.value ?? n.Value ?? `Entity ${idx + 1}`,
          type: String(n.type ?? n.Type ?? 'concept'),
          properties: n.properties ?? n.Properties ?? {},
          score: typeof n.score === 'number' ? n.score : (typeof n.Score === 'number' ? n.Score : 0.5),
          // place in a small ring around the source node
          x: (node.x ?? 400) + Math.cos((idx / Math.max(1, neighbors.length)) * 2 * Math.PI) * 120,
          y: (node.y ?? 300) + Math.sin((idx / Math.max(1, neighbors.length)) * 2 * Math.PI) * 120,
          size: Math.max(20, Math.min(60, ((typeof n.score === 'number' ? n.score : 0.5)) * 80)),
          color: getNodeColor(String(n.type ?? 'concept')),
        }))

      // Create edges from center to each new node (best-effort when API doesn't return edges)
      const newEdges: GraphEdge[] = newNodes.map((nbr) => ({
        id: `${node.id}-${nbr.id}`,
        source: node.id,
        target: nbr.id,
        type: 'related',
        properties: {},
        weight: 1,
      }))

      // Merge without duplicates
      setGraphData(prev => {
        const mergedNodes = [...prev.nodes]
        for (const n of newNodes) {
          if (!mergedNodes.find(x => x.id === n.id)) mergedNodes.push(n)
        }
        const edgeKey = (e: GraphEdge) => `${e.source}->${e.target}`
        const seen = new Set(prev.edges.map(edgeKey))
        const mergedEdges = [...prev.edges]
        for (const e of newEdges) {
          const k = edgeKey(e)
          if (!seen.has(k)) {
            mergedEdges.push(e)
            seen.add(k)
          }
        }
        return { ...prev, nodes: mergedNodes, edges: mergedEdges }
      })
      speak(`Expanded ${node.name} by ${newNodes.length} entities.`, 'responding')
    } catch (err) {
      console.error('Expand failed', err)
      speak('Failed to expand from the selected node.', 'error')
    } finally {
      setIsLoading(false)
      idle()
    }
  }, [getConnectedEntities, graphData.nodes, idle, speak, think])

  // Fetch related search results for a node name
  const fetchRelatedResults = useCallback(async (node: GraphNode) => {
    try {
      const res = await searchGet(node.name, 5)
      const hits = (res as any)?.hits ?? (res as any)?.Hits ?? []
      setRelatedResults(hits.slice(0, 5))
    } catch (e) {
      // non-fatal
      setRelatedResults([])
    }
  }, [searchGet])

  // Search entities
  const searchEntities = useCallback(async () => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      suggest("Enter a search term to find specific entities in your knowledge graph!")
      return
    }

    // Local highlight search across currently loaded nodes (no API call)
    const updatedNodes = graphData.nodes.map(node => ({
      ...node,
      highlighted: node.name?.toLowerCase().includes(q)
    }))
    const count = updatedNodes.filter((n: any) => n.highlighted).length
    setGraphData(prev => ({ ...prev, nodes: updatedNodes }))
    if (count > 0) speak(`Highlighted ${count} matching entities.`, 'responding')
    else speak('No matching entities found. Try different search terms.', 'suggesting')
  }, [graphData.nodes, searchQuery, speak, suggest])

  // Handle zoom
  const handleZoom = (delta: number) => {
    setZoomLevel(prev => Math.max(0.1, Math.min(3, prev + delta)))
  }

  // Convert screen coords to graph coords (accounting for pan and zoom)
  const toGraphCoords = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    // s = pan + (400,300) + (g - (400,300)) * z
    const z = zoomLevel
    const gx = ((sx - pan.x - 400) / z) + 400
    const gy = ((sy - pan.y - 300) / z) + 300
    return { x: gx, y: gy }
  }

  // Pan handlers (background drag)
  const onSvgMouseDown = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    // Only start panning if not starting on a node
    if (e.button !== 0) return
    setIsPanning(true)
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }
  const onSvgMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (isPanning && panStartRef.current) {
      setPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y })
    } else if (draggingNodeId) {
      const { x, y } = toGraphCoords(e.clientX, e.clientY)
      setGraphData(prev => {
        const idx = prev.nodes.findIndex(n => n.id === draggingNodeId)
        if (idx === -1) return prev
        const updated = [...prev.nodes]
        const off = dragOffsetRef.current || { dx: 0, dy: 0 }
        updated[idx] = { ...updated[idx], x: x + off.dx, y: y + off.dy }
        return { ...prev, nodes: updated }
      })
    }
  }
  const onSvgMouseUp = () => {
    setIsPanning(false)
    panStartRef.current = null
    setDraggingNodeId(null)
    dragOffsetRef.current = null
  }

  // Node drag start
  const onNodeMouseDown = (node: GraphNode) => (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraggingNodeId(node.id)
    const { x, y } = toGraphCoords(e.clientX, e.clientY)
    dragOffsetRef.current = { dx: (node.x ?? 0) - x, dy: (node.y ?? 0) - y }
  }

  // Fit graph to viewport
  const fitToView = useCallback(() => {
    const div = containerRef.current
    if (!div || graphData.nodes.length === 0) return
    const width = div.clientWidth || 800
    const height = div.clientHeight || 600
    const xs = graphData.nodes.map(n => n.x || 0)
    const ys = graphData.nodes.map(n => n.y || 0)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const gWidth = Math.max(50, maxX - minX)
    const gHeight = Math.max(50, maxY - minY)
    const pad = 80
    const z = Math.min(3, Math.max(0.2, Math.min((width - pad) / gWidth, (height - pad) / gHeight)))
    setZoomLevel(z)
    // Center
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const panX = (width / 2) - (400 + (cx - 400) * z)
    const panY = (height / 2) - (300 + (cy - 300) * z)
    setPan({ x: panX, y: panY })
  }, [graphData.nodes])

  // Center on selected node
  const centerOnNode = (node: GraphNode) => {
    const div = containerRef.current
    if (!div) return
    const width = div.clientWidth || 800
    const height = div.clientHeight || 600
    const nx = node.x ?? 400
    const ny = node.y ?? 300
    const panX = (width / 2) - (400 + (nx - 400) * zoomLevel)
    const panY = (height / 2) - (300 + (ny - 300) * zoomLevel)
    setPan({ x: panX, y: panY })
  }

  // Get entity type statistics
  const getEntityStats = () => {
    const stats: Record<string, number> = {}
    graphData.nodes.forEach(node => {
      stats[node.type] = (stats[node.type] || 0) + 1
    })
    return stats
  }

  // Relayout nodes (deterministic radial by degree)
  const relayout = () => {
    const degree = new Map<string, number>()
    for (const e of graphData.edges) {
      degree.set(e.source, (degree.get(e.source) || 0) + 1)
      degree.set(e.target, (degree.get(e.target) || 0) + 1)
    }
    const sorted = [...graphData.nodes].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
    const n = Math.max(1, sorted.length)
    const radius = Math.min(350, 80 + n * 10)
    const laid = sorted.map((node, index) => {
      const angle = (index / n) * 2 * Math.PI
      return { ...node, x: 400 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius }
    })
    // Map back to original order
    const byId = new Map(laid.map(n => [n.id, n]))
    setGraphData(prev => ({ ...prev, nodes: prev.nodes.map(n => byId.get(n.id) || n) }))
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

            {/* Run Discovery */}
            <button
              onClick={async () => {
                try {
                  setIsLoading(true)
                  think()
                  await discoverAll()
                  await loadGraph(graphData.focus)
                  speak('Graph relationships discovered and refreshed.', 'responding')
                } catch (e) {
                  console.error(e)
                  speak('Failed to run discovery.', 'error')
                } finally {
                  setIsLoading(false)
                  idle()
                }
              }}
              title="Discover relationships and refresh graph"
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
            >Run Discovery</button>

            {/* Zoom + Fit Controls */}
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
              <button
                onClick={fitToView}
                title="Auto-fit graph"
                className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs"
              >Fit</button>
              <button
                onClick={relayout}
                title="Re-layout"
                className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs"
              >Layout</button>
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
                          className={`text-sm capitalize font-medium ${getNodeTextClass(type)}`}
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

                {/* Date Range */}
                <div className="mb-6 grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="graph-from-date" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      From Date
                    </label>
                    <input
                      type="date"
                      id="graph-from-date"
                      title="Filter entities created on or after this date"
                      value={filters.fromDate || ''}
                      onChange={(e) => setFilters(prev => ({ ...prev, fromDate: e.target.value || undefined }))}
                      className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="graph-to-date" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      To Date
                    </label>
                    <input
                      type="date"
                      id="graph-to-date"
                      title="Filter entities created on or before this date"
                      value={filters.toDate || ''}
                      onChange={(e) => setFilters(prev => ({ ...prev, toDate: e.target.value || undefined }))}
                      className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
                    />
                  </div>
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
            onMouseDown={onSvgMouseDown}
            onMouseMove={onSvgMouseMove}
            onMouseUp={onSvgMouseUp}
            onMouseLeave={onSvgMouseUp}
          >
            <g transform={`translate(${pan.x},${pan.y})`}>
            <g transform={`translate(400,300) scale(${zoomLevel}) translate(-400,-300)`}>
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
                    onMouseDown={onNodeMouseDown(node)}
                    onClick={() => {
                      handleNodeClick(node)
                      centerOnNode(node)
                    }}
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
            </g>
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

                {typeof selectedNode.score === 'number' && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Relevance Score</span>
                      <span className="font-medium">{(selectedNode.score * 100).toFixed(1)}%</span>
                    </div>
                    <progress
                      className="w-full h-2 mt-1 [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-value]:bg-purple-600 rounded"
                      value={Math.max(0, Math.min(100, (selectedNode.score || 0) * 100))}
                      max={100}
                      aria-label="Relevance score"
                    />
                  </div>
                )}

                {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Properties
                    </h4>
                    <div className="space-y-1 text-sm max-h-40 overflow-auto pr-1">
                      {Object.entries(selectedNode.properties).map(([key, value]) => (
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

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => loadGraph(selectedNode.id)}
                    className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                  >
                    Focus Here
                  </button>
                  <button
                    onClick={() => expandFromNode(selectedNode)}
                    className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
                  >
                    Expand 1 hop
                  </button>
                  <button
                    onClick={() => centerOnNode(selectedNode)}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg transition-colors"
                  >
                    Center
                  </button>
                  <button
                    onClick={() => fetchRelatedResults(selectedNode)}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg transition-colors"
                  >
                    Search related
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        setIsCopying(true)
                        const url = new URL(window.location.href)
                        url.searchParams.set('focus', selectedNode.id)
                        await navigator.clipboard.writeText(url.toString())
                      } finally {
                        setTimeout(() => setIsCopying(false), 800)
                      }
                    }}
                    title={isCopying ? 'Copied!' : 'Copy link'}
                    className={`px-3 py-2 ${isCopying ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'} hover:bg-gray-300 dark:hover:bg-gray-600 text-sm rounded-lg transition-colors`}
                  >
                    <ShareIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Inline related results */}
                {Array.isArray(relatedResults) && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Related notes/documents
                    </h4>
                    {relatedResults.length === 0 ? (
                      <p className="text-sm text-gray-500">No related results.</p>
                    ) : (
                      <ul className="space-y-2 max-h-40 overflow-auto pr-1">
                        {relatedResults.map((r: any, i: number) => (
                          <li key={i} className="text-sm">
                            <div className="font-medium text-gray-900 dark:text-white truncate">
                              {r.title ?? r.Title ?? r.fileName ?? r.FileName ?? r.id ?? 'Untitled'}
                            </div>
                            {r.snippet || r.Snippet ? (
                              <div className="text-gray-600 dark:text-gray-400 line-clamp-2 text-xs" dangerouslySetInnerHTML={{ __html: r.snippet ?? r.Snippet }} />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
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
                    <div className={`w-3 h-3 rounded-full ${getNodeBgClass(type)}`} />
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
