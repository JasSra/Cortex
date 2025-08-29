import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Note, GraphNode, GraphEdge } from '@/api/cortex-api-client'

// Types for our store - reuse generated API models

export interface ChatMessage {
  id: string
  content: string
  role: 'user' | 'assistant' | 'system'
  timestamp: string
  tools?: any[]
}

export interface SearchResult {
  id: string
  title: string
  content: string
  score: number
  highlight: string
}

interface CortexState {
  // UI State
  activeView: 'dashboard' | 'chat' | 'search' | 'documents' | 'graph' | 'settings'
  sidebarOpen: boolean
  
  // Data State
  notes: Note[]
  graphNodes: GraphNode[]
  graphEdges: GraphEdge[]
  chatMessages: ChatMessage[]
  searchResults: SearchResult[]
  
  // Loading States
  loading: {
    notes: boolean
    graph: boolean
    chat: boolean
    search: boolean
  }
  isLoading: boolean
  
  // Error States
  errors: {
    notes: string | null
    graph: string | null
    chat: string | null
    search: string | null
  }
  
  // Actions
  setActiveView: (view: CortexState['activeView']) => void
  setSidebarOpen: (open: boolean) => void
  
  // Data Actions
  setNotes: (notes: Note[]) => void
  addNote: (note: Note) => void
  setGraphData: (nodes: GraphNode[], edges: GraphEdge[]) => void
  addChatMessage: (message: ChatMessage) => void
  setSearchResults: (results: SearchResult[]) => void
  
  // Loading Actions
  setLoading: (key: keyof CortexState['loading'], loading: boolean) => void
  setIsLoading: (loading: boolean) => void
  
  // Error Actions
  setError: (key: keyof CortexState['errors'], error: string | null) => void
  clearErrors: () => void
}

export const useCortexStore = create<CortexState>()(
  devtools(
    (set, get) => ({
      // Initial UI State
      activeView: 'dashboard',
      sidebarOpen: true,
      
      // Initial Data State
      notes: [],
      graphNodes: [],
      graphEdges: [],
      chatMessages: [],
      searchResults: [],
      
      // Initial Loading States
      loading: {
        notes: false,
        graph: false,
        chat: false,
        search: false,
      },
      isLoading: false,
      
      // Initial Error States
      errors: {
        notes: null,
        graph: null,
        chat: null,
        search: null,
      },
      
      // UI Actions
      setActiveView: (view) => set({ activeView: view }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      
      // Data Actions
      setNotes: (notes) => set({ notes }),
      addNote: (note) => set((state) => ({ notes: [...state.notes, note] })),
      setGraphData: (nodes, edges) => set({ graphNodes: nodes, graphEdges: edges }),
      addChatMessage: (message) => set((state) => ({ 
        chatMessages: [...state.chatMessages, message] 
      })),
      setSearchResults: (results) => set({ searchResults: results }),
      
      // Loading Actions
      setLoading: (key, loading) => set((state) => ({
        loading: { ...state.loading, [key]: loading }
      })),
      setIsLoading: (loading) => set({ isLoading: loading }),
      
      // Error Actions
      setError: (key, error) => set((state) => ({
        errors: { ...state.errors, [key]: error }
      })),
      clearErrors: () => set({
        errors: { notes: null, graph: null, chat: null, search: null }
      }),
    }),
    { name: 'cortex-store' }
  )
)

// Computed selectors
export const useActiveLoading = () => {
  const loading = useCortexStore((state) => state.loading)
  return Object.values(loading).some(Boolean)
}

export const useHasErrors = () => {
  const errors = useCortexStore((state) => state.errors)
  return Object.values(errors).some(Boolean)
}
