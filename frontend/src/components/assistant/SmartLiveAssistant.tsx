"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MicrophoneIcon,
  SpeakerWaveIcon,
  StopIcon,
  BoltIcon,
  SunIcon,
  MoonIcon,
  QueueListIcon,
  WrenchScrewdriverIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'

import AdaptiveCardView from './AdaptiveCardView'
import { useMascot } from '@/contexts/MascotContext'
import { useChatToolsApi, useVoiceApi, useGamificationApi } from '@/services/apiClient'
import { useAppAuth } from '@/hooks/useAppAuth'

type Role = 'user' | 'assistant' | 'system'

interface Message {
  id: string
  role: Role
  content: string
  timestamp: Date
}

interface ToolExecResult {
  id: string
  title: string
  card: any
  success?: boolean
}

interface PendingTask {
  id: string
  label: string
  run: () => Promise<void>
}

const LONG_RUNNING_TOOLS = new Set<string>(["reindex", "reembed", "export", "bulk", "statistics"]) // heuristic
const DANGEROUS_TOOLS = new Set<string>(["reindex", "reembed", "export", "delete", "purge"]) // confirmation

const SmartLiveAssistant: React.FC = () => {
  const [liveMode, setLiveMode] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [workingItems, setWorkingItems] = useState<ToolExecResult[]>([])
  const [tasks, setTasks] = useState<PendingTask[]>([])
  const [theme, setTheme] = useState<'system' | 'dark' | 'light'>('system')
  const [inputText, setInputText] = useState('')
  const [availableTools, setAvailableTools] = useState<string[]>([])
  const [partialText, setPartialText] = useState('')
  const [confirmQueue, setConfirmQueue] = useState<Array<{ tool: string; args?: any; title?: string }>>([])
  const [autoExecuteTools, setAutoExecuteTools] = useState(true)
  const [knownAchievementIds, setKnownAchievementIds] = useState<Set<string>>(new Set())
  const [achievementToasts, setAchievementToasts] = useState<Array<{ id: string; name: string; icon?: string }>>([])

  const recognitionRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const interruptTokenRef = useRef<string>('0')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const { listen, think, idle, respond, speak: mascotSpeak, error: mascotError } = useMascot()
  const { processChat, executeTool, getAvailableTools } = useChatToolsApi()
  const voiceApi = useVoiceApi()
  const { checkAchievements, getMyAchievements } = useGamificationApi() as any
  const { getAccessToken } = useAppAuth()

  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
  const wsUrl = useMemo(() => {
    try {
      const u = new URL(baseUrl)
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
      u.pathname = '/voice/stt'
      u.search = ''
      return u.toString()
    } catch {
      return 'ws://localhost:8081/voice/stt'
    }
  }, [baseUrl])

  // Theme handling (local override; falls back to global app theme)
  const containerThemeClass = useMemo(() => {
    if (theme === 'system') return ''
    return theme === 'dark' ? 'dark' : ''
  }, [theme])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Greeting
  useEffect(() => {
    const hello: Message = { id: 'welcome', role: 'assistant', content: "I’m ready. Speak or type to begin.", timestamp: new Date() }
    setMessages([hello])
    mascotSpeak("I'm ready when you are. Start speaking!")
  }, [mascotSpeak])

  // Preload available tools and current achievements
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const tools = await getAvailableTools()
        if (mounted && Array.isArray(tools)) setAvailableTools(tools)
      } catch {
        // ignore; tools list is optional
      }
      try {
        // Prime achievements baseline
        const mine: any[] = await getMyAchievements()
        const ids = new Set<string>()
        for (const a of mine || []) {
          const id = (a.id ?? a.Id ?? '').toString()
          if (id) ids.add(id)
        }
        if (mounted) setKnownAchievementIds(ids)
      } catch {}
    })()
    return () => { mounted = false }
  }, [getAvailableTools, getMyAchievements])

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause() } catch {}
      try { audioRef.current.src = '' } catch {}
      audioRef.current = null
    }
    setIsSpeaking(false)
    idle()
  }, [idle])

  const speakTts = useCallback(async (text: string) => {
    setIsSpeaking(true)
    respond()
    try {
      // Prefer streaming URL for faster start
      const streamUrl = await voiceApi.ttsStreamUrl(text)
      const audio = new Audio(streamUrl)
      audioRef.current = audio
      audio.onended = () => {
        setIsSpeaking(false)
        idle()
      }
      await audio.play()
      return
    } catch {}

    // Fallback to browser TTS (chunk by sentences for better interruption)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const parts = text.split(/([.!?]+\s+)/)
      const chunks: string[] = []
      for (let i = 0; i < parts.length; i += 2) {
        const sentence = (parts[i] || '') + (parts[i + 1] || '')
        if (sentence.trim()) chunks.push(sentence)
      }
      for (const chunk of chunks) {
        if (!window.speechSynthesis) break
        const u = new SpeechSynthesisUtterance(chunk)
        u.rate = 0.95
        u.pitch = 1.0
        await new Promise<void>(resolve => {
          u.onend = () => resolve()
          window.speechSynthesis!.speak(u)
        })
        if (!isSpeaking) break
      }
      setIsSpeaking(false)
      idle()
    } else {
      setIsSpeaking(false)
      idle()
    }
  }, [idle, respond, voiceApi, isSpeaking])

  const interrupt = useCallback(() => {
    // Increment token to invalidate in-flight results
    interruptTokenRef.current = (parseInt(interruptTokenRef.current, 10) + 1).toString()
    stopAudio()
  }, [stopAudio])

  const handleTranscript = useCallback(async (text: string) => {
    if (!text.trim()) return
    const tokenAtStart = interruptTokenRef.current
    interrupt() // stop any current speech and deprioritize in-flight ops

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, userMessage])

    setIsProcessing(true)
    think()

    try {
      // Build ChatToolsRequest as expected by backend: { query, availableTools, context }
      const recent = [...messages, userMessage].slice(-12)
      const payload: any = {
        // support both legacy and new shapes
        messages: recent.map(m => ({ role: m.role, content: m.content })),
        query: userMessage.content,
        availableTools,
        temperature: 0.7,
        maxTokens: 500,
        useRag: true,
        context: { recentMessages: recent.map(m => ({ role: m.role, content: m.content, at: m.timestamp.toISOString() })) }
      }
      const res: any = await processChat(payload)

      if (interruptTokenRef.current !== tokenAtStart) return // dropped due to newer input

      const reply = (res?.response || res?.answer || 'OK').toString()
      const assistantMessage: Message = { id: Date.now().toString() + '_assistant', role: 'assistant', content: reply, timestamp: new Date() }
      setMessages(prev => [...prev, assistantMessage])

      // Speak response (non-blocking)
      speakTts(assistantMessage.content)

      // Execute suggested tools if provided
      const tools: Array<{ tool: string; args?: any; title?: string }> = res?.suggestedTools || res?.SuggestedTools || []
      for (const t of tools) {
        const isTask = LONG_RUNNING_TOOLS.has(t.tool.toLowerCase())
        const needsConfirm = !autoExecuteTools || DANGEROUS_TOOLS.has(t.tool.toLowerCase()) || !!res?.requiresConfirmation
        const exec = async () => {
          const execToken = interruptTokenRef.current
          try {
            const result: any = await executeTool({ tool: t.tool, args: t.args || {} })
            if (interruptTokenRef.current !== execToken) return // ignore if superseded

            // Try to interpret result as adaptive card, else wrap it
            const card = (result?.card || result?.adaptiveCard || {
              type: 'AdaptiveCard',
              version: '1.5',
              body: [
                { type: 'TextBlock', text: t.title || t.tool, weight: 'Bolder', size: 'Medium' },
                { type: 'TextBlock', text: 'Result', wrap: true },
                { type: 'RichTextBlock', inlines: [{ type: 'TextRun', text: JSON.stringify(result, null, 2) }] }
              ]
            })
            setWorkingItems(prev => [{ id: Date.now().toString(), title: t.title || t.tool, card, success: true }, ...prev])
            try {
              await checkAchievements()
              const mine: any[] = await getMyAchievements()
              const newOnes: Array<{ id: string; name: string; icon?: string }> = []
              const nextSet = new Set(knownAchievementIds)
              for (const a of mine || []) {
                const id = (a.id ?? a.Id ?? '').toString()
                if (id && !nextSet.has(id)) {
                  nextSet.add(id)
                  newOnes.push({ id, name: a.name ?? a.Name ?? 'Achievement Unlocked', icon: a.icon ?? a.Icon })
                }
              }
              if (newOnes.length) {
                setKnownAchievementIds(nextSet)
                setAchievementToasts(prev => [...prev, ...newOnes])
                // Auto-dismiss after 6s per batch
                setTimeout(() => {
                  setAchievementToasts(prev => prev.slice(newOnes.length))
                }, 6000)
              }
            } catch {}
          } catch (e: any) {
            const card = {
              type: 'AdaptiveCard', version: '1.5', body: [
                { type: 'TextBlock', text: `${t.tool} failed`, weight: 'Bolder', color: 'Attention' },
                { type: 'TextBlock', text: e?.message || 'Unknown error', wrap: true }
              ]
            }
            setWorkingItems(prev => [{ id: Date.now().toString(), title: t.title || t.tool, card, success: false }, ...prev])
          }
        }

        if (needsConfirm) {
          setConfirmQueue(prev => [...prev, t])
        } else if (isTask) {
          setTasks(prev => [...prev, { id: `${Date.now()}_${t.tool}`, label: t.title || t.tool, run: exec }])
        } else {
          // Fire and forget, keep UI responsive
          exec()
        }
      }
    } catch (err: any) {
      const assistantMessage: Message = { id: Date.now().toString() + '_err', role: 'assistant', content: 'Sorry, I hit an error.', timestamp: new Date() }
      setMessages(prev => [...prev, assistantMessage])
    } finally {
      setIsProcessing(false)
      idle()
    }
  }, [availableTools, autoExecuteTools, executeTool, idle, messages, processChat, speakTts, think, interrupt, checkAchievements])

  // Try WebSocket streaming STT first, then fall back to browser STT
  const startListening = useCallback(async () => {
    interrupt()
    setPartialText('')
    // Prefer MediaRecorder + WS to backend
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia not available')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const token = await getAccessToken()?.catch(() => null) as string | null
      const authed = token ? `${wsUrl}?access_token=${encodeURIComponent(token)}` : wsUrl
      const ws = new WebSocket(authed)
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => {
        mediaStreamRef.current = stream
        setIsListening(true)
        listen()
        const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
        mediaRecorderRef.current = rec
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            e.data.arrayBuffer().then(buf => ws.send(buf))
          }
        }
        rec.start(250)
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const text: string = msg?.text || msg?.partial || ''
          if (!text) return
          if (msg?.final || msg?.type === 'final') {
            setPartialText('')
            handleTranscript(text)
          } else {
            setPartialText(text)
          }
        } catch {}
      }
      ws.onerror = () => {
        // let onclose trigger cleanup; we will fall back next time
      }
      ws.onclose = () => {
        setIsListening(false)
        setPartialText('')
        try { mediaRecorderRef.current?.stop() } catch {}
        try { mediaStreamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
        mediaRecorderRef.current = null
        mediaStreamRef.current = null
        wsRef.current = null
        idle()
      }
      wsRef.current = ws
      return
    } catch {
      // Fallback path below
    }
    if (!(globalThis as any).webkitSpeechRecognition) {
      mascotError("Voice input not supported in this browser.")
      return
    }
    setIsListening(true)
    listen()
    if (!recognitionRef.current) {
      recognitionRef.current = new (window as any).webkitSpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'
    }
    let finalTranscript = ''
    recognitionRef.current.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalTranscript += transcript
        else interim += transcript
      }
      setPartialText(interim)
      // When a phrase is finalized, handle it
      if (finalTranscript.trim()) {
        handleTranscript(finalTranscript.trim())
        finalTranscript = ''
      }
    }
    recognitionRef.current.onerror = () => { setIsListening(false); setPartialText(''); idle() }
    recognitionRef.current.onend = () => { setIsListening(false); setPartialText(''); idle() }
    recognitionRef.current.start()
  }, [handleTranscript, idle, listen, mascotError, wsUrl, interrupt, getAccessToken])

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current || mediaStreamRef.current || wsRef.current) {
      try { mediaRecorderRef.current?.stop() } catch {}
      try { mediaStreamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
      try { wsRef.current?.close() } catch {}
      mediaRecorderRef.current = null
      mediaStreamRef.current = null
      wsRef.current = null
      setIsListening(false)
      setPartialText('')
      idle()
      return
    }
    if (recognitionRef.current && isListening) {
      try { recognitionRef.current.stop() } catch {}
      setIsListening(false)
      setPartialText('')
      idle()
    }
  }, [idle, isListening])

  // Hard stop: interrupt any speech/processing and stop listening
  const hardStop = useCallback(() => {
    interrupt()
    setIsProcessing(false)
    stopListening()
  }, [interrupt, setIsProcessing, stopListening])

  // Live mode orchestrator
  useEffect(() => {
    if (liveMode) {
      startListening()
    } else {
      stopListening()
      stopAudio()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMode])

  const runNextTask = useCallback(async () => {
    const [next, ...rest] = tasks
    if (!next) return
    setTasks(rest)
    await next.run()
  }, [tasks])

  // UI helpers
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  const sendInput = useCallback(() => {
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    handleTranscript(text)
  }, [handleTranscript, inputText])

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendInput()
    }
  }

  return (
    <div className={`${containerThemeClass} h-full w-full`}>
      <div className="h-full flex bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* Working Area (left) */}
        <div className="w-[36%] min-w-[300px] max-w-[520px] border-r border-gray-200 dark:border-gray-800 p-4 space-y-3 overflow-y-auto bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <WrenchScrewdriverIcon className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-semibold">Working Area</span>
            </div>
            <div className="flex items-center gap-2">
              <QueueListIcon className="w-4 h-4 text-gray-500" />
              <span className="text-xs text-gray-500">{tasks.length} queued</span>
              <button onClick={runNextTask} disabled={!tasks.length} className="text-xs px-2 py-1 rounded bg-purple-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white">Run next</button>
            </div>
          </div>
          {workingItems.length === 0 && (
            <div className="text-xs text-gray-500">Tool outputs will appear here as cards.</div>
          )}
          {workingItems.map(item => (
            <div key={item.id} className="space-y-2">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{item.title}</div>
              <AdaptiveCardView card={item.card} />
            </div>
          ))}
        </div>

        {/* Conversation (right) */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/60 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BoltIcon className="w-5 h-5 text-purple-500" />
                <div className="font-semibold">Smart Live Assistant</div>
                <div className="text-xs text-gray-500">Constant, interruptible interaction</div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 mr-2">
                  <input type="checkbox" className="accent-purple-600" checked={autoExecuteTools} onChange={e => setAutoExecuteTools(e.target.checked)} />
                  Auto-execute tools
                </label>
                <button
                  className={`px-3 py-1 text-sm rounded ${liveMode ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                  onClick={() => setLiveMode(v => !v)}
                >
                  {liveMode ? 'Live: On' : 'Live: Off'}
                </button>
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded bg-gray-200 dark:bg-gray-700"
                  title="Toggle theme"
                >
                  {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <AnimatePresence>
              {messages.map(m => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 border text-sm ${m.role === 'user' ? 'ml-auto bg-purple-50 dark:bg-purple-900/40 border-purple-200 dark:border-purple-800' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    <div className="text-[10px] text-gray-500 mt-1">{m.timestamp.toLocaleTimeString()}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {!!partialText && (
              <div className="max-w-[80%] ml-auto text-xs text-gray-500 dark:text-gray-400 italic">{partialText}</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Controls */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/60 flex items-center gap-2">
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              className={`px-3 py-2 rounded flex items-center gap-2 ${isListening ? 'bg-red-500 text-white' : 'bg-purple-600 text-white'}`}
            >
              <MicrophoneIcon className="w-5 h-5" /> {isListening ? 'Stop Listening' : 'Start Listening'}
            </button>
            <button
              type="button"
              onClick={hardStop}
              className="px-3 py-2 rounded flex items-center gap-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              title="Stop all activity"
            >
              <StopIcon className="w-5 h-5" /> Stop
            </button>
            <button
              type="button"
              disabled={!isSpeaking}
              onClick={stopAudio}
              className={`px-3 py-2 rounded flex items-center gap-2 ${isSpeaking ? 'bg-orange-500 text-white' : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
            >
              <SpeakerWaveIcon className="w-5 h-5" /> {isSpeaking ? 'Stop Speaking' : 'Speaking' }
            </button>
            <div className="ml-auto flex-1" />
            {/* Text input */}
            <div className="flex items-center gap-2 w-[50%] min-w-[320px]">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Type your request…"
                className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
              />
              <button
                type="button"
                onClick={sendInput}
                className="px-3 py-2 rounded bg-purple-600 text-white flex items-center gap-2 disabled:opacity-60"
                disabled={!inputText.trim()}
                title="Send"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-gray-500 pl-3">
              {isProcessing ? 'Thinking…' : isListening ? 'Listening…' : isSpeaking ? 'Speaking…' : 'Idle'}
            </div>
          </div>

          {/* Confirmation Tray */}
          {confirmQueue.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col gap-2">
              <div className="text-sm font-medium">Confirm tool actions</div>
              {confirmQueue.map((t, idx) => (
                <div key={`${t.tool}_${idx}`} className="flex items-center justify-between text-sm border border-gray-200 dark:border-gray-700 rounded p-2">
                  <div className="text-gray-700 dark:text-gray-200">
                    <span className="font-semibold mr-2">{t.title || t.tool}</span>
                    <span className="text-gray-500">{t.args ? JSON.stringify(t.args) : ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2 py-1 rounded bg-purple-600 text-white text-xs"
                      onClick={async () => {
                        setConfirmQueue(q => q.filter((_, i) => i !== idx))
                        const execToken = interruptTokenRef.current
                        try {
                          const result: any = await executeTool({ tool: t.tool, args: t.args || {} })
                          if (interruptTokenRef.current !== execToken) return
                          const card = (result?.card || result?.adaptiveCard || { type: 'AdaptiveCard', version: '1.5', body: [ { type: 'TextBlock', text: t.title || t.tool, weight: 'Bolder' }, { type: 'TextBlock', text: JSON.stringify(result, null, 2), wrap: true } ] })
                          setWorkingItems(prev => [{ id: Date.now().toString(), title: t.title || t.tool, card, success: true }, ...prev])
                          try { await checkAchievements() } catch {}
                        } catch (e: any) {
                          const card = { type: 'AdaptiveCard', version: '1.5', body: [ { type: 'TextBlock', text: `${t.tool} failed`, color: 'Attention' }, { type: 'TextBlock', text: e?.message || 'Unknown error', wrap: true } ] }
                          setWorkingItems(prev => [{ id: Date.now().toString(), title: t.title || t.tool, card, success: false }, ...prev])
                        }
                      }}
                    >
                      Run
                    </button>
                    <button
                      className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-xs"
                      onClick={() => setConfirmQueue(q => q.filter((_, i) => i !== idx))}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Achievement Toasts */}
      {achievementToasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-6 right-6 space-y-2 z-40">
          {achievementToasts.map(a => (
            <div key={a.id} className="pointer-events-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-lg">
                {a.icon ?? '★'}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Achievement Unlocked!</div>
                <div className="text-xs text-gray-600 dark:text-gray-300">{a.name}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SmartLiveAssistant
