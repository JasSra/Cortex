import { useCallback } from 'react'
import { 
  WorkflowContext, 
  InterpreterRequest, 
  InterpreterResponse, 
  QueryBuilderRequest, 
  NormalizedSearchQuery,
  SummarizerRequest,
  SummarizerResponse,
  WorkflowResult,
  SearchResult
} from '@/types/workflow'
import { useCortexApiClient } from './apiClient'

export class AIWorkflowService {
  private apiClient: any

  constructor(apiClient: any) {
    this.apiClient = apiClient
  }

  async processUtterance(utterance: string, context: WorkflowContext): Promise<WorkflowResult> {
    try {
      // Step 1: Interpreter - Classify intent and structure
      const interpreterResponse = await this.interpretUtterance({ utterance, context })
      
      const result: WorkflowResult = {
        type: interpreterResponse.intent,
        interpreter: interpreterResponse
      }

      if (interpreterResponse.intent === 'search' && interpreterResponse.structuredSearch) {
        // Step 2: Query Builder - Convert to normalized search
        const searchQuery = await this.buildSearchQuery({
          structuredSearch: interpreterResponse.structuredSearch,
          context
        })
        result.searchQuery = searchQuery

        // Step 3: Execute search
        const searchResults = await this.executeSearch(searchQuery)
        result.searchResults = searchResults

        // Step 4: Summarizer - Create summary and TTS
        const summary = await this.summarizeResults({
          querySummary: interpreterResponse.structuredSearch.rawQuery,
          results: searchResults,
          context
        })
        result.summary = summary

      } else if (interpreterResponse.intent === 'command' && interpreterResponse.command) {
        // Execute command
        const commandResult = await this.executeCommand(interpreterResponse.command, context)
        result.commandResult = commandResult
      }

      return result
    } catch (error) {
      return {
        type: 'search',
        interpreter: { intent: 'search', confidence: 0 },
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  private async interpretUtterance(request: InterpreterRequest): Promise<InterpreterResponse> {
    const systemPrompt = `SYSTEM PROMPT — UNIVERSAL Q&A + COMMAND INTERPRETER

Role: You interpret transcribed user speech for a CRM SaaS. You output ONLY JSON. No prose.

Goals:
1) Global Q&A: turn user questions into a structured SEARCH when appropriate.
2) Commands: detect predefined commands and return a normalized command object.
3) Always use provided context.

Context provided every call:
- currentPage: "${request.context.currentPage}"
- currentNoteId: "${request.context.currentNoteId}"
- tenantId: "${request.context.tenantId}"
- userId: "${request.context.userId}"
- locale: "${request.context.locale}"
- utterance: "${request.utterance}"

Classify intent as exactly one of:
- "search"     // includes general Q&A that needs retrieval
- "command"

Allowed commands (case-insensitive):
- open_note { noteId? }
- search_notes { query, filters? }
- create_note { title?, body?, tags?[] }
- delete_note { noteId }
- update_note { noteId, ops[] }                 // ops: { path, op: replace|add|remove, value? }
- list_notes { filters? }
- attach_file { noteId, fileName, fileMime, fileSizeBytes }
- set_tag { noteId, tag }
- remove_tag { noteId, tag }

Rules:
- If a required arg is missing but currentNoteId exists, use it.
- For destructive ops (delete_note), set confirmationRequired=true unless noteId is explicit and unambiguous.
- For Q&A like "show my meeting notes from last week", that is intent="search".
- Do not include reasoning. No comments. JSON only.

Output JSON schema:
{
  "intent": "search" | "command",
  "confidence": 0.0-1.0,
  "structuredSearch": {            // present only when intent=search
    "rawQuery": "string",
    "entities": ["contacts"|"companies"|"notes"|"tasks"|"deals"|"tickets"...],
    "mustInclude": ["string"...],
    "mustExclude": ["string"...],
    "filters": {
      "dateRange": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } | null,
      "owners": ["${request.context.userId}"...],
      "tags": ["string"...],
      "status": ["string"...],
      "stage": ["string"...],
      "fields": [{ "field": "string", "op": "eq|neq|gt|gte|lt|lte|contains", "value": "any" }]
    },
    "sort": [{ "field": "string", "dir": "asc|desc" }],
    "limit": 20,
    "offset": 0,
    "noteContext": { "currentNoteId": "${request.context.currentNoteId}" }
  },
  "command": {                    // present only when intent=command
    "name": "open_note|search_notes|create_note|delete_note|update_note|list_notes|attach_file|set_tag|remove_tag",
    "args": { "k": "v" },
    "confirmationRequired": false
  }
}`

    const response = await this.apiClient.assistPOST({
      context: systemPrompt,
      prompt: request.utterance,
      mode: 'assist',
      provider: 'openai',
      maxTokens: 500,
      temperature: 0.1
    })

    try {
      return JSON.parse(response.text || '{}') as InterpreterResponse
    } catch (error) {
      // Fallback to search if parsing fails
      return {
        intent: 'search',
        confidence: 0.5,
        structuredSearch: {
          rawQuery: request.utterance,
          entities: ['notes'],
          mustInclude: request.utterance.split(' ').filter(w => w.length > 2),
          mustExclude: [],
          filters: {
            owners: [request.context.userId]
          },
          sort: [{ field: 'updatedAt', dir: 'desc' }],
          limit: 20,
          offset: 0,
          noteContext: { currentNoteId: request.context.currentNoteId }
        }
      }
    }
  }

  private async buildSearchQuery(request: QueryBuilderRequest): Promise<NormalizedSearchQuery> {
    const systemPrompt = `SYSTEM PROMPT — STRUCTURED SEARCH BUILDER

Role: Convert a high-level structuredSearch object into a backend-ready normalized search request. Output ONLY JSON.

Inputs:
- tenantId: "${request.context.tenantId}"
- userId: "${request.context.userId}"
- currentPage: "${request.context.currentPage}"
- noteContext: "${request.context.currentNoteId}"
- structuredSearch: ${JSON.stringify(request.structuredSearch)}

Output JSON schema:
{
  "index": ["notes","contacts","companies", "..."],
  "query": {
    "must": [{ "text": "string" }...],
    "filter": [
      { "term": { "tenantId": "${request.context.tenantId}" } },
      { "term": { "ownerId": "${request.context.userId}" } },
      { "range": { "date": { "gte": "ISO8601?", "lte": "ISO8601?" } } },
      { "terms": { "tags": ["string"...] } },
      { "field": { "name": "string", "op": "eq|neq|gt|gte|lt|lte|contains", "value": "any" } }
    ]
  },
  "page": { "size": 20, "cursor": null },
  "sort": [{ "field": "_score", "dir": "desc" }, { "field": "updatedAt", "dir": "desc" }],
  "returnFields": ["id","type","title","snippet","score","updatedAt","ownerId","tags"],
  "context": { "currentPage": "${request.context.currentPage}", "currentNoteId": "${request.context.currentNoteId}" }
}`

    const response = await this.apiClient.assistPOST({
      context: systemPrompt,
      prompt: JSON.stringify(request.structuredSearch),
      mode: 'assist',
      provider: 'openai',
      maxTokens: 300,
      temperature: 0.0
    })

    try {
      return JSON.parse(response.text || '{}') as NormalizedSearchQuery
    } catch (error) {
      // Fallback to simple query
      return {
        index: ['notes'],
        query: {
          must: [{ text: request.structuredSearch.rawQuery }],
          filter: [
            { term: { tenantId: request.context.tenantId } },
            { term: { ownerId: request.context.userId } }
          ]
        },
        page: { size: 20, cursor: null },
        sort: [{ field: '_score', dir: 'desc' }, { field: 'updatedAt', dir: 'desc' }],
        returnFields: ['id', 'type', 'title', 'snippet', 'score', 'updatedAt', 'ownerId', 'tags'],
        context: { currentPage: request.context.currentPage, currentNoteId: request.context.currentNoteId }
      }
    }
  }

  private async executeSearch(query: NormalizedSearchQuery): Promise<SearchResult[]> {
    try {
      // Use the existing search API - need to adapt the query format
      const searchQuery = query.query.must.map(m => m.text).join(' ')
      const response = await this.apiClient.searchGet(searchQuery, query.page.size, 'hybrid', 0.6)
      
      // Normalize the response format
      const hits = response?.Hits || response?.hits || []
      return hits.map((hit: any) => ({
        id: hit.id || hit.Id,
        type: hit.type || hit.Type || 'note',
        title: hit.title || hit.Title || '',
        snippet: hit.snippet || hit.Snippet || hit.content || '',
        score: hit.score || hit.Score || 0,
        updatedAt: hit.updatedAt || hit.UpdatedAt || new Date().toISOString(),
        ownerId: hit.ownerId || hit.OwnerId || '',
        tags: hit.tags || hit.Tags || []
      }))
    } catch (error) {
      console.error('Search execution failed:', error)
      return []
    }
  }

  private async summarizeResults(request: SummarizerRequest): Promise<SummarizerResponse> {
    const systemPrompt = `SYSTEM PROMPT — RESULTS SUMMARIZER WITH TTS

Role: Summarize search results and produce a short TTS script. Output ONLY JSON.

Inputs:
- querySummary: "${request.querySummary}"
- results: ${JSON.stringify(request.results)}
- currentPage: "${request.context.currentPage}"

Output JSON schema:
{
  "summaryBullets": ["max 6 bullets, concise"],
  "topPicks": [{ "id": "string", "reason": "short" }],   // 1–3 items
  "suggestedFollowUps": ["refine by date", "filter by owner ${request.context.userId}", "open note ID"],
  "ttsScript": "Max ~120 words. Natural. No IDs unless spoken-friendly."
}`

    const response = await this.apiClient.assistPOST({
      context: systemPrompt,
      prompt: `Summarize these ${request.results.length} search results for: "${request.querySummary}"`,
      mode: 'assist',
      provider: 'openai',
      maxTokens: 400,
      temperature: 0.2
    })

    try {
      return JSON.parse(response.text || '{}') as SummarizerResponse
    } catch (error) {
      // Fallback summary
      const topResults = request.results.slice(0, 3)
      return {
        summaryBullets: [
          `Found ${request.results.length} results for "${request.querySummary}"`,
          ...topResults.map(r => `${r.title}: ${r.snippet.substring(0, 50)}...`)
        ],
        topPicks: topResults.map(r => ({ id: r.id, reason: 'High relevance' })),
        suggestedFollowUps: [
          'Refine search terms',
          'Filter by date range',
          topResults.length > 0 ? `Open "${topResults[0].title}"` : 'Create new note'
        ],
        ttsScript: `I found ${request.results.length} results for ${request.querySummary}. ${topResults.length > 0 ? `The top result is ${topResults[0].title}.` : ''} Would you like me to open one of these or refine the search?`
      }
    }
  }

  private async executeCommand(command: any, context: WorkflowContext): Promise<any> {
    try {
      switch (command.name) {
        case 'open_note':
          if (command.args.noteId) {
            // Navigate to note - this would typically be handled by the UI router
            return { action: 'navigate', url: `/notes/${command.args.noteId}` }
          }
          break
          
        case 'create_note':
          const noteData = {
            title: command.args.title || 'New Note',
            content: command.args.body || '',
            tags: command.args.tags || []
          }
          const note = await this.apiClient.notesPOST(noteData)
          return { action: 'note_created', note }
          
        case 'search_notes':
          const searchResult = await this.apiClient.searchGet(
            command.args.query, 
            20, 
            'hybrid', 
            0.6
          )
          return { action: 'search_completed', results: searchResult }
          
        case 'delete_note':
          if (command.args.noteId) {
            await this.apiClient.notesDELETE(command.args.noteId)
            return { action: 'note_deleted', noteId: command.args.noteId }
          }
          break
          
        default:
          return { error: `Command ${command.name} not implemented` }
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Command execution failed' }
    }
  }
}

// Hook to use the AI workflow service
export function useAIWorkflow() {
  const apiClient = useCortexApiClient()
  
  const processUtterance = useCallback(async (utterance: string, context: WorkflowContext): Promise<WorkflowResult> => {
    const service = new AIWorkflowService(apiClient)
    return await service.processUtterance(utterance, context)
  }, [apiClient])

  return { processUtterance }
}
