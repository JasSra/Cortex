'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAssistApi, useVoiceApi } from '@/services/apiClient'
import { useAppAuth } from '@/hooks/useAppAuth'
import TranscriptionControl from '@/components/voice/TranscriptionControl'
import { useAIWorkflow } from '@/services/aiWorkflow'
import { WorkflowContext, WorkflowResult } from '@/types/workflow'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  MagnifyingGlassIcon, 
  CommandLineIcon, 
  SpeakerWaveIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline'

type Mode = 'suggest' | 'summarize' | 'rewrite'

export interface SmartNoteEditorProps {
  initialContent?: string
  placeholder?: string
  onChange?: (text: string) => void
  onSave?: (text: string) => void
  onSelect?: (selectedText: string) => void
  className?: string
  noteId?: string | null
  currentPage?: string
}

export function SmartNoteEditor({ 
  initialContent = '', 
  placeholder = 'Start typing your note… or speak to search, create, or command', 
  onChange, 
  onSave, 
  onSelect, 
  className,
  noteId = null,
  currentPage = 'notes.edit'
}: SmartNoteEditorProps) {
  const [text, setText] = useState(initialContent)
  const [suggestion, setSuggestion] = useState('')
  const [mode, setMode] = useState<Mode>('suggest')
  const [loading, setLoading] = useState(false)
  const [debounceMs, setDebounceMs] = useState(450)
  const [provider, setProvider] = useState<'openai'|'ollama'>(() => (localStorage.getItem('editor:provider') as any) || 'openai')
  
  // AI Workflow state
  const [enableAIWorkflow, setEnableAIWorkflow] = useState(true)
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(null)
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const [lastUtterance, setLastUtterance] = useState('')

  const { assist } = useAssistApi()
  const voice = useVoiceApi()
  const { getAccessToken } = useAppAuth()
  const { processUtterance } = useAIWorkflow()

  const lastReqId = useRef(0)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => { onChange?.(text) }, [text, onChange])

  // Debounced inline suggestions (only when not using AI workflow)
  useEffect(() => {
    if (enableAIWorkflow || !text || text.trim().length < 5) {
      setSuggestion('')
      return
    }
    const id = ++lastReqId.current
    const t = setTimeout(async () => {
      try {
        setLoading(true)
        const res = await assist({ context: text.slice(-1500), mode: 'suggest', provider, maxTokens: 80, temperature: 0.4 })
        if (id === lastReqId.current) setSuggestion(res.text?.trim() ?? '')
      } catch {
        if (id === lastReqId.current) setSuggestion('')
      } finally {
        if (id === lastReqId.current) setLoading(false)
      }
    }, debounceMs)
    return () => clearTimeout(t)
  }, [text, debounceMs, assist, provider, enableAIWorkflow])

  // Create workflow context
  const workflowContext = useMemo((): WorkflowContext => ({
    currentPage,
    currentNoteId: noteId,
    tenantId: 'default', // This should come from your auth context
    userId: 'current-user', // This should come from your auth context  
    locale: 'en-US'
  }), [currentPage, noteId])

  const playTTS = useCallback(async (ttsText: string) => {
    try {
      // Stop any existing audio
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause()
        ttsAudioRef.current = null
      }

      const url = await voice.ttsStreamUrl(ttsText)
      const audio = new Audio(url)
      ttsAudioRef.current = audio
      
      await audio.play()
    } catch (error) {
      console.error('TTS playback failed:', error)
    }
  }, [voice])

  // Handle streaming transcription
  const handleStreamingText = useCallback(async (utteranceText: string, isPartial: boolean) => {
    if (!enableAIWorkflow || isPartial) return

    setLastUtterance(utteranceText)
    setWorkflowLoading(true)
    setWorkflowResult(null)

    try {
      const result = await processUtterance(utteranceText, workflowContext)
      setWorkflowResult(result)

      // Handle the result
      if (result.type === 'search' && result.summary?.ttsScript) {
        // Play TTS response
        await playTTS(result.summary.ttsScript)
      } else if (result.type === 'command' && result.commandResult) {
        // Handle command result
        if (result.commandResult.action === 'note_created') {
          // Could navigate to new note or update current text
          const newNote = result.commandResult.note
          if (newNote.content) {
            setText(prev => prev + '\n\n' + newNote.content)
          }
        }
      }
    } catch (error) {
      console.error('AI Workflow failed:', error)
      setWorkflowResult({
        type: 'search',
        interpreter: { intent: 'search', confidence: 0 },
        error: error instanceof Error ? error.message : 'Workflow processing failed'
      })
    } finally {
      setWorkflowLoading(false)
    }
  }, [enableAIWorkflow, processUtterance, workflowContext, playTTS])

  // Handle traditional transcript completion
  const handleTranscript = useCallback((transcriptText: string) => {
    if (!enableAIWorkflow) {
      setText(prev => {
        if (prev.trim() === '') {
          return transcriptText
        }
        return prev + (prev.endsWith(' ') ? '' : ' ') + transcriptText
      })
    }
  }, [enableAIWorkflow])

  const applySuggestion = useCallback(() => {
    if (!suggestion) return
    const newText = text.endsWith('\n') ? text + suggestion : text + (text.endsWith(' ') ? '' : ' ') + suggestion
    setText(newText)
    setSuggestion('')
  }, [text, suggestion])

  const doSummarize = useCallback(async () => {
    if (!text) return
    setMode('summarize')
    setLoading(true)
    try {
      const res = await assist({ context: text.slice(-4000), mode: 'summarize', provider, maxTokens: 120, temperature: 0.2 })
      setSuggestion(res.text?.trim() ?? '')
    } finally {
      setLoading(false)
    }
  }, [text, assist, provider])

  const doRewrite = useCallback(async () => {
    if (!text) return
    setMode('rewrite')
    setLoading(true)
    try {
      const res = await assist({ context: text.slice(-2000), prompt: 'Improve clarity and brevity; keep essence. Return only revised text.', mode: 'rewrite', provider, maxTokens: 200, temperature: 0.2 })
      setSuggestion(res.text?.trim() ?? '')
    } finally {
      setLoading(false)
    }
  }, [text, assist, provider])

  const toolbar = useMemo(() => (
    <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <div className="flex items-center gap-2">
        <button
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            enableAIWorkflow 
              ? 'bg-purple-600 text-white shadow-sm' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
          onClick={() => setEnableAIWorkflow(!enableAIWorkflow)}
          title="Toggle AI-powered voice workflow"
        >
          {enableAIWorkflow ? (
            <>
              <CommandLineIcon className="w-4 h-4 inline mr-1" />
              AI Workflow
            </>
          ) : (
            'Basic Mode'
          )}
        </button>
        
        {!enableAIWorkflow && (
          <>
            <button
              className="px-3 py-1.5 rounded-md text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              onClick={doSummarize}
              title="Summarize current note"
            >
              Summarize
            </button>
            <button
              className="px-3 py-1.5 rounded-md text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              onClick={doRewrite}
              title="Rewrite last section"
            >
              Rewrite
            </button>
          </>
        )}
      </div>
      
      <div className="ml-auto flex items-center gap-3">
        <select
          className="text-xs border rounded px-2 py-1 bg-white dark:bg-slate-800 border-gray-300 dark:border-gray-600"
          value={provider}
          onChange={(e) => { 
            const v = (e.target.value as 'openai'|'ollama')
            setProvider(v)
            try { localStorage.setItem('editor:provider', v) } catch {} 
          }}
          title="AI provider"
        >
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
        </select>
        
        {!enableAIWorkflow && (
          <>
            <label className="text-xs text-gray-600 dark:text-gray-400">Debounce</label>
            <input 
              type="range" 
              min={200} 
              max={1200} 
              step={50} 
              value={debounceMs} 
              onChange={e => setDebounceMs(parseInt(e.target.value))}
              title={`Debounce delay: ${debounceMs}ms`}
              className="w-16"
            />
            {suggestion && (
              <span className="text-[11px] text-gray-500">Tab to accept</span>
            )}
          </>
        )}
      </div>
    </div>
  ), [enableAIWorkflow, doSummarize, doRewrite, provider, debounceMs, suggestion])

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 ${className || ''}`}>
      {toolbar}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 min-h-0">
        {/* Main Editor */}
        <div className="lg:col-span-2 p-4 flex flex-col">
          {/* Text Editor */}
          <div className="relative flex-1">
            {/* Ghost suggestion overlay */}
            {!enableAIWorkflow && suggestion && (
              <pre aria-hidden="true" className="pointer-events-none absolute inset-3 whitespace-pre-wrap font-mono text-sm leading-6 select-none">
                <span className="invisible">{text}</span>
                <span className="text-gray-400">{(text && !text.endsWith(' ') ? ' ' : '') + suggestion}</span>
              </pre>
            )}
            
            <textarea
              className="w-full h-80 lg:h-96 resize-none outline-none bg-transparent font-mono text-sm leading-6 p-3 border-0"
              placeholder={placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (!enableAIWorkflow && suggestion && e.key === 'Tab') {
                  e.preventDefault()
                  applySuggestion()
                }
              }}
              onSelect={(e) => {
                const target = e.target as HTMLTextAreaElement
                const start = target.selectionStart
                const end = target.selectionEnd
                const selectedText = text.substring(start, end).trim()
                onSelect?.(selectedText)
              }}
            />
          </div>

          {/* Voice Controls */}
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                {enableAIWorkflow ? (
                  <>
                    <CommandLineIcon className="w-4 h-4" />
                    Smart Voice Assistant
                  </>
                ) : (
                  'Voice Transcription'
                )}
              </h4>
              {workflowLoading && (
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                  <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Processing...
                </div>
              )}
            </div>
            
            <TranscriptionControl
              onTranscript={handleTranscript}
              onStreamingText={enableAIWorkflow ? handleStreamingText : undefined}
              streamingMode={enableAIWorkflow}
              className="w-full"
              showPlayback={true}
            />
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex gap-2">
            <button
              className="px-4 py-2 rounded-md text-sm bg-purple-600 text-white disabled:opacity-50 hover:bg-purple-700 transition-colors"
              onClick={() => onSave?.(text)}
              disabled={!onSave}
            >
              Save Note
            </button>
            {!enableAIWorkflow && suggestion && (
              <button
                className="px-4 py-2 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                onClick={applySuggestion}
              >
                Apply Suggestion
              </button>
            )}
          </div>
        </div>

        {/* AI Workflow Results Panel */}
        {enableAIWorkflow && (
          <div className="lg:col-span-1 border-l border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/30">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <MagnifyingGlassIcon className="w-4 h-4" />
              AI Assistant
            </h3>

            <AnimatePresence mode="wait">
              {lastUtterance && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                    Last Command:
                  </div>
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    &ldquo;{lastUtterance}&rdquo;
                  </div>
                </motion.div>
              )}

              {workflowResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  {workflowResult.error ? (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-red-700 dark:text-red-300">
                          {workflowResult.error}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Intent Classification */}
                      <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            Intent
                          </span>
                          <span className="text-xs text-gray-400">
                            {Math.round((workflowResult.interpreter.confidence || 0) * 100)}%
                          </span>
                        </div>
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          workflowResult.type === 'search' 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                        }`}>
                          {workflowResult.type === 'search' ? (
                            <MagnifyingGlassIcon className="w-3 h-3" />
                          ) : (
                            <CommandLineIcon className="w-3 h-3" />
                          )}
                          {workflowResult.type}
                        </div>
                      </div>

                      {/* Search Results */}
                      {workflowResult.type === 'search' && workflowResult.summary && (
                        <div className="space-y-3">
                          {/* Summary */}
                          <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                              Summary
                            </div>
                            <ul className="space-y-1">
                              {workflowResult.summary.summaryBullets.map((bullet, i) => (
                                <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-1">
                                  <span className="text-gray-400 mt-1.5">•</span>
                                  {bullet}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Top Picks */}
                          {workflowResult.summary.topPicks.length > 0 && (
                            <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                Top Results
                              </div>
                              <div className="space-y-2">
                                {workflowResult.summary.topPicks.map((pick, i) => (
                                  <div key={i} className="flex items-start gap-2">
                                    <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                        {pick.id}
                                      </div>
                                      <div className="text-xs text-gray-600 dark:text-gray-400">
                                        {pick.reason}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* TTS Playback */}
                          {workflowResult.summary.ttsScript && (
                            <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                  Audio Response
                                </span>
                                <button
                                  onClick={() => playTTS(workflowResult.summary!.ttsScript)}
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                                >
                                  <SpeakerWaveIcon className="w-3 h-3" />
                                  Play
                                </button>
                              </div>
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                {workflowResult.summary.ttsScript}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Command Result */}
                      {workflowResult.type === 'command' && workflowResult.commandResult && (
                        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                            Command Result
                          </div>
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            {JSON.stringify(workflowResult.commandResult, null, 2)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}

              {!workflowResult && !workflowLoading && (
                <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
                  <MagnifyingGlassIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  Speak a command or question to get started
                </div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
