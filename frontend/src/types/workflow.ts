// AI Workflow types for the speech-to-action pipeline
export interface WorkflowContext {
  currentPage: string
  currentNoteId: string | null
  tenantId: string
  userId: string
  locale: string
}

export interface InterpreterRequest {
  utterance: string
  context: WorkflowContext
}

export interface StructuredSearch {
  rawQuery: string
  entities: string[]
  mustInclude: string[]
  mustExclude: string[]
  filters: {
    dateRange?: { from: string; to: string }
    owners?: string[]
    tags?: string[]
    status?: string[]
    stage?: string[]
    fields?: Array<{
      field: string
      op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'
      value: any
    }>
  }
  sort: Array<{ field: string; dir: 'asc' | 'desc' }>
  limit: number
  offset: number
  noteContext: { currentNoteId: string | null }
}

export interface Command {
  name: 'open_note' | 'search_notes' | 'create_note' | 'delete_note' | 'update_note' | 'list_notes' | 'attach_file' | 'set_tag' | 'remove_tag'
  args: Record<string, any>
  confirmationRequired: boolean
}

export interface InterpreterResponse {
  intent: 'search' | 'command'
  confidence: number
  structuredSearch?: StructuredSearch
  command?: Command
}

export interface QueryBuilderRequest {
  structuredSearch: StructuredSearch
  context: WorkflowContext
}

export interface NormalizedSearchQuery {
  index: string[]
  query: {
    must: Array<{ text: string }>
    filter: Array<any>
  }
  page: { size: number; cursor: string | null }
  sort: Array<{ field: string; dir: 'asc' | 'desc' }>
  returnFields: string[]
  context: { currentPage: string; currentNoteId: string | null }
}

export interface SearchResult {
  id: string
  type: string
  title: string
  snippet: string
  score: number
  updatedAt: string
  ownerId: string
  tags: string[]
}

export interface SummarizerRequest {
  querySummary: string
  results: SearchResult[]
  context: WorkflowContext
}

export interface SummarizerResponse {
  summaryBullets: string[]
  topPicks: Array<{ id: string; reason: string }>
  suggestedFollowUps: string[]
  ttsScript: string
}

export interface WorkflowResult {
  type: 'search' | 'command'
  interpreter: InterpreterResponse
  searchQuery?: NormalizedSearchQuery
  searchResults?: SearchResult[]
  summary?: SummarizerResponse
  commandResult?: any
  error?: string
}
