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
} from '@heroicons/react/24/outline'

import AdaptiveCardView from './AdaptiveCardView'
import { useMascot } from '@/contexts/MascotContext'
import { useChatToolsApi, useVoiceApi } from '@/services/apiClient'

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

const SmartLiveAssistant: React.FC = () => {
  const [liveMode, setLiveMode] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [workingItems, setWorkingItems] = useState<ToolExecResult[]>([])
  const [tasks, setTasks] = useState<PendingTask[]>([])
  const [theme, setTheme] = useState<'system' | 'dark' | 'light'>('system')

  const recognitionRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const interruptTokenRef = useRef<string>('0')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { listen, think, idle, respond, speak: mascotSpeak, error: mascotError } = useMascot()
  const { processChat, executeTool } = useChatToolsApi()
  const voiceApi = useVoiceApi()

  const baseUrl = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

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
      const blob = await voiceApi.tts(text)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        setIsSpeaking(false)
        idle()
        URL.revokeObjectURL(url)
      }
      await audio.play()
      return
    } catch {}

    // Fallback to browser TTS
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.95
      utterance.pitch = 1.0
      utterance.onend = () => { setIsSpeaking(false); idle() }
      window.speechSynthesis.speak(utterance)
    } else {
      setIsSpeaking(false)
      idle()
    }
  }, [idle, respond, voiceApi])

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
      const chatMessages = [...messages, userMessage].map(m => ({ role: m.role, content: m.content }))
      const res: any = await processChat({ messages: chatMessages })

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

        if (isTask) {
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
  }, [executeTool, idle, messages, processChat, speakTts, think, interrupt])

  // Browser STT (fallback). Streaming WS STT can be added later.
  const startListening = useCallback(() => {
    if (!(globalThis as any).webkitSpeechRecognition) {
      mascotError("Voice input not supported in this browser.")
      return
    }
    interrupt()
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
      // When a phrase is finalized, handle it
      if (finalTranscript.trim()) {
        handleTranscript(finalTranscript.trim())
        finalTranscript = ''
      }
    }
    recognitionRef.current.onerror = () => { setIsListening(false); idle() }
    recognitionRef.current.onend = () => { setIsListening(false); idle() }
    recognitionRef.current.start()
  }, [handleTranscript, idle, interrupt, listen, mascotSpeak])

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      try { recognitionRef.current.stop() } catch {}
      setIsListening(false)
      idle()
    }
  }, [idle, isListening])

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
              disabled={!isSpeaking}
              onClick={stopAudio}
              className={`px-3 py-2 rounded flex items-center gap-2 ${isSpeaking ? 'bg-orange-500 text-white' : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
            >
              <SpeakerWaveIcon className="w-5 h-5" /> {isSpeaking ? 'Stop Speaking' : 'Speaking' }
            </button>
            <div className="ml-auto text-xs text-gray-500">
              {isProcessing ? 'Thinking…' : isListening ? 'Listening…' : isSpeaking ? 'Speaking…' : 'Idle'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SmartLiveAssistant
