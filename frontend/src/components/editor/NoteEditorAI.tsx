"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAssistApi, useVoiceApi } from '@/services/apiClient'
import { useAppAuth } from '@/hooks/useAppAuth'

type Mode = 'suggest' | 'summarize' | 'rewrite'

export interface NoteEditorAIProps {
  initialContent?: string
  placeholder?: string
  onChange?: (text: string) => void
  onSave?: (text: string) => void
  onSelect?: (selectedText: string) => void
  className?: string
}

export function NoteEditorAI({ initialContent = '', placeholder = 'Start typing your note…', onChange, onSave, onSelect, className }: NoteEditorAIProps) {
  const [text, setText] = useState(initialContent)
  const [suggestion, setSuggestion] = useState('')
  const [mode, setMode] = useState<Mode>('suggest')
  const [loading, setLoading] = useState(false)
  const [debounceMs, setDebounceMs] = useState(450)
  const [provider, setProvider] = useState<'openai'|'ollama'>(() => (localStorage.getItem('editor:provider') as any) || 'openai')

  const { assist } = useAssistApi()
  const voice = useVoiceApi()
  const { getAccessToken } = useAppAuth()

  const lastReqId = useRef(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => { onChange?.(text) }, [text, onChange])

  // Debounced inline suggestions
  useEffect(() => {
    if (!text || text.trim().length < 5) {
      setSuggestion('')
      return
    }
    const id = ++lastReqId.current
    const t = setTimeout(async () => {
      try {
        setLoading(true)
        // Use regular assist API
        const res = await assist({ context: text.slice(-1500), mode: 'suggest', provider, maxTokens: 80, temperature: 0.4 })
        if (id === lastReqId.current) setSuggestion(res.text?.trim() ?? '')
      } catch {
        if (id === lastReqId.current) setSuggestion('')
      } finally {
        if (id === lastReqId.current) setLoading(false)
      }
    }, debounceMs)
    return () => clearTimeout(t)
  }, [text, debounceMs, assist, provider])

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

  const speak = useCallback(async (t: string) => {
    try {
      const url = await voice.ttsStreamUrl(t)
      const audio = new Audio(url)
      audio.play().catch(() => {/* ignore */})
    } catch {/* ignore */}
  }, [voice])

  // Voice dictation via WebSocket -> STT
  const startVoice = useCallback(async () => {
    if (recorderRef.current || wsRef.current) return
    const token = await getAccessToken()
    const base = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
    const wsUrl = `${base.replace('http', 'ws')}/voice/stt?access_token=${encodeURIComponent(token || '')}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
        if (msg && msg.text) {
          setText(prev => (prev.endsWith(' ') || prev.length === 0) ? prev + msg.text : prev + ' ' + msg.text)
        }
      } catch {
        // ignore
      }
    }
    ws.onclose = () => {
      wsRef.current = null
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioStreamRef.current = stream
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    recorderRef.current = rec
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        e.data.arrayBuffer().then(buf => ws.send(buf))
      }
    }
    rec.start(250) // small chunks for low latency
  }, [getAccessToken])

  const stopVoice = useCallback(() => {
    if (recorderRef.current) {
      try { recorderRef.current.stop() } catch {}
      recorderRef.current = null
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop())
      audioStreamRef.current = null
    }
    if (wsRef.current) {
      try { wsRef.current.send('end') } catch {}
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }
  }, [])

  const recording = !!recorderRef.current

  const toolbar = useMemo(() => (
    <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-700">
      <button
        className={`px-3 py-1.5 rounded-md text-sm ${recording ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
        onClick={() => recording ? stopVoice() : startVoice()}
        title={recording ? 'Stop voice dictation' : 'Start voice dictation'}
      >{recording ? 'Stop' : 'Mic'}</button>
      <button
        className="px-3 py-1.5 rounded-md text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        onClick={doSummarize}
        title="Summarize current note"
      >Summarize</button>
      <button
        className="px-3 py-1.5 rounded-md text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        onClick={doRewrite}
        title="Rewrite last section"
      >Rewrite</button>
      <div className="ml-auto flex items-center gap-2">
        <select
          className="text-xs border rounded px-2 py-1 bg-white dark:bg-slate-800"
          value={provider}
          onChange={(e) => { const v = (e.target.value as 'openai'|'ollama'); setProvider(v); try { localStorage.setItem('editor:provider', v) } catch {} }}
          title="AI provider"
        >
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
        </select>
        <label className="text-xs text-gray-600 dark:text-gray-400">Debounce</label>
        <input 
          type="range" 
          min={200} 
          max={1200} 
          step={50} 
          value={debounceMs} 
          onChange={e => setDebounceMs(parseInt(e.target.value))}
          title={`Debounce delay: ${debounceMs}ms`}
          aria-label="AI suggestion debounce delay"
        />
        {suggestion && (
          <span className="text-[11px] text-gray-500 ml-2">Tab to accept</span>
        )}
      </div>
    </div>
  ), [recording, stopVoice, startVoice, doSummarize, doRewrite, debounceMs])

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden ${className || ''}`}>
      {toolbar}
      <div className="grid grid-cols-1 md:grid-cols-3">
        <div className="md:col-span-2 p-3">
          {/* Ghost suggestion overlay container */}
          <div className="relative">
            {/* Overlay shows ghost text after current content; typed text is invisible in overlay to align line breaks */}
            {suggestion && (
              <pre aria-hidden="true" className="pointer-events-none absolute inset-3 whitespace-pre-wrap font-mono text-sm leading-6 select-none">
                <span className="invisible">{text}</span>
                <span className="text-gray-400">{(text && !text.endsWith(' ') ? ' ' : '') + suggestion}</span>
              </pre>
            )}
            <textarea
              className="w-full h-72 md:h-96 resize-y outline-none bg-transparent font-mono text-sm leading-6"
            placeholder={placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (suggestion && e.key === 'Tab') {
                  e.preventDefault()
                  const sep = text && !text.endsWith(' ') ? ' ' : ''
                  setText(text + sep + suggestion)
                  setSuggestion('')
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
          <div className="mt-3 flex gap-2">
            <button
              className="px-3 py-1.5 rounded-md text-sm bg-purple-600 text-white disabled:opacity-50"
              onClick={() => onSave?.(text)}
              disabled={!onSave}
            >Save</button>
            {suggestion && (
              <>
                <button className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white" onClick={applySuggestion}>Apply Suggestion</button>
                <button className="px-3 py-1.5 rounded-md text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100" onClick={() => speak(suggestion)}>Speak</button>
              </>
            )}
          </div>
        </div>
        <div className="md:col-span-1 p-3 border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Assistant</div>
            <div className="text-xs text-gray-500">{loading ? 'thinking…' : mode}</div>
          </div>
          <div className="text-sm whitespace-pre-wrap min-h-[8rem]">
            {suggestion ? suggestion : <span className="text-gray-500">Type to see suggestions…</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
