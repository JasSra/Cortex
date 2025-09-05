'use client'

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  MicrophoneIcon,
  SpeakerWaveIcon,
  SparklesIcon,
  DocumentTextIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon,
  TagIcon,
  ChatBubbleLeftRightIcon,
  EyeIcon,
  PencilIcon,
  FolderPlusIcon,
  BookmarkIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { useCortexApiClient, useVoiceApi, useAssistApi, useIngestApi, useSuggestionsApi } from '@/services/apiClient'
import { useAppAuth } from '@/hooks/useAppAuth'
import { NoteEditorAI } from '@/components/editor/NoteEditorAI'

interface VoiceWorkflowForm {
  id: string
  title: string
  content: string
  tags: string[]
  isProcessing: boolean
  suggestions: {
    title?: string
    summary?: string
    tags?: string[]
    improvements?: string[]
  }
}

interface WorkflowStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'active' | 'completed' | 'error'
  voiceSupported: boolean
  aiSuggestions: boolean
}

export default function WorkflowPage() {
  const { isAuthenticated } = useAuth()
  const { getAccessToken } = useAppAuth()
  
  // Voice state
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceCommand, setVoiceCommand] = useState('')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  
  // Workflow state
  const [activeStep, setActiveStep] = useState('capture')
  const [workflowForms, setWorkflowForms] = useState<VoiceWorkflowForm[]>([])
  const [activeFormId, setActiveFormId] = useState<string | null>(null)
  
  // AI Enhancement state
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([])
  const [isProcessingAI, setIsProcessingAI] = useState(false)
  const [autoEnhancements, setAutoEnhancements] = useState(true)
  
  // Voice refs
  const recorderRef = useRef<MediaRecorder | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // API hooks
  const { assist } = useAssistApi()
  const voice = useVoiceApi()
  const { uploadFiles } = useIngestApi() // For creating notes
  const { suggestNoteTitle, generateSummary, classifyContent, getProactiveSuggestions } = useSuggestionsApi()

  // Custom note creation function using ingest API
  const createNote = useCallback(async (noteData: { title: string; content: string }) => {
    // Create a temporary file to ingest
    const blob = new Blob([noteData.content], { type: 'text/plain' })
    const file = new File([blob], `${noteData.title}.txt`, { type: 'text/plain' })
    const fileList = new DataTransfer()
    fileList.items.add(file)
    return await uploadFiles(fileList.files)
  }, [uploadFiles])

  // Cleanup effect - stop recording when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup function runs on unmount
      if (recorderRef.current) {
        try { 
          if (recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop() 
          }
        } catch {}
        recorderRef.current = null
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
        audioStreamRef.current = null
      }
      if (wsRef.current) {
        try { wsRef.current.close() } catch {}
        wsRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  // Workflow steps configuration
  const workflowSteps: WorkflowStep[] = useMemo(() => [
    {
      id: 'capture',
      title: 'Voice Capture',
      description: 'Dictate your ideas using voice input',
      status: activeStep === 'capture' ? 'active' : 'completed',
      voiceSupported: true,
      aiSuggestions: false
    },
    {
      id: 'structure',
      title: 'AI Structure',
      description: 'Let AI organize and enhance your content',
      status: activeStep === 'structure' ? 'active' : activeStep === 'capture' ? 'pending' : 'completed',
      voiceSupported: true,
      aiSuggestions: true
    },
    {
      id: 'enhance',
      title: 'Smart Enhancement',
      description: 'Apply AI suggestions and voice feedback',
      status: activeStep === 'enhance' ? 'active' : ['capture', 'structure'].includes(activeStep) ? 'pending' : 'completed',
      voiceSupported: true,
      aiSuggestions: true
    },
    {
      id: 'finalize',
      title: 'Voice Review',
      description: 'Listen to your content and finalize',
      status: activeStep === 'finalize' ? 'active' : ['capture', 'structure', 'enhance'].includes(activeStep) ? 'pending' : 'completed',
      voiceSupported: true,
      aiSuggestions: false
    }
  ], [activeStep])

  // Initialize a new workflow form
  const createNewForm = useCallback(() => {
    const newForm: VoiceWorkflowForm = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      tags: [],
      isProcessing: false,
      suggestions: {}
    }
    setWorkflowForms(prev => [...prev, newForm])
    setActiveFormId(newForm.id)
    return newForm
  }, [])

  // Voice transcription setup
  const startVoiceCapture = useCallback(async () => {
    if (isRecording) return // Check actual recording state instead of refs
    
    // Clean up any existing references first
    if (recorderRef.current) {
      try { recorderRef.current.stop() } catch {}
      recorderRef.current = null
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop())
      audioStreamRef.current = null
    }
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }
    
    try {
      setIsRecording(true) // Set state immediately for UI feedback
      setVoiceError(null) // Clear any previous errors
      
      // Check microphone permissions first
      try {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        if (permission.state === 'denied') {
          throw new Error('Microphone permission denied. Please enable microphone access in your browser settings.')
        }
      } catch (permError) {
        console.warn('Could not check microphone permission:', permError)
      }

      const token = await getAccessToken()
      const base = (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
      const wsUrl = `${base.replace('http', 'ws')}/voice/stt?access_token=${encodeURIComponent(token || '')}`
      
      console.log('Connecting to WebSocket:', wsUrl)
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connection established')
      }

      ws.onmessage = (ev) => {
        const processText = (raw: string) => {
          if (!raw) return
          // Normalize potential local echo prefix and whitespace/newlines
          let text = raw.trim()
          if (text.toLowerCase().startsWith('echo:')) {
            text = text.slice(5).trim()
          }
          // Some providers may send multiple lines
          text = text.split('\n').map(s => s.trim()).filter(Boolean).join(' ')

          if (!text) return

          console.log('Received transcription:', text)
          setVoiceTranscript(prev => {
            const newText = (prev.endsWith(' ') || prev.length === 0) ? prev + text : prev + ' ' + text

            if (activeStep === 'capture' && activeFormId) {
              setWorkflowForms(forms => forms.map(form => 
                form.id === activeFormId 
                  ? { ...form, content: newText }
                  : form
              ))
            }

            return newText
          })
        }

        try {
          if (typeof ev.data === 'string') {
            // Try JSON first, then fallback to plain text
            try {
              const msg = JSON.parse(ev.data)
              if (msg && typeof msg.text === 'string') {
                processText(msg.text)
              } else if (typeof msg === 'string') {
                processText(msg)
              } else {
                // Unknown JSON shape; ignore
              }
            } catch {
              // Not JSON, treat as plain text
              processText(ev.data)
            }
          } else if (ev.data instanceof Blob) {
            ev.data.text().then(processText).catch(err => {
              console.warn('Failed to read Blob message:', err)
            })
          } else if (ev.data instanceof ArrayBuffer) {
            const decoder = new TextDecoder()
            processText(decoder.decode(new Uint8Array(ev.data)))
          } else {
            console.warn('Unknown WebSocket message type:', typeof ev.data)
          }
        } catch (e) {
          console.warn('Voice message handling error:', e)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setVoiceError('Voice connection error. Please try again.')
        setIsRecording(false)
      }

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        if (event.code !== 1000) {
          setVoiceError(`Voice connection closed (${event.code}).`)
        }
        wsRef.current = null
        setIsRecording(false)
      }

      // Get audio stream with better error handling
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      })
      audioStreamRef.current = stream
      
      // Create MediaRecorder with fallback mimeType
      let mimeType = 'audio/webm'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/wav'
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg'
      }
      
      const rec = new MediaRecorder(stream, { mimeType })
      recorderRef.current = rec
      
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          e.data.arrayBuffer().then(buf => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(buf)
            }
          })
        }
      }
      
      rec.onerror = (error) => {
        console.error('MediaRecorder error:', error)
        setIsRecording(false)
      }
      
      rec.start(250) // Send data every 250ms
      console.log('Voice recording started')
      
    } catch (error) {
      console.error('Voice capture failed:', error)
      setIsRecording(false)
      
      // Clean up on error
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
        audioStreamRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (recorderRef.current) {
        recorderRef.current = null
      }

      // Show error to user
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setVoiceError(`Voice recording failed: ${errorMessage}`)
    }
  }, [getAccessToken, activeStep, activeFormId, isRecording])

  const stopVoiceCapture = useCallback(() => {
    console.log('Stopping voice capture...')
    
    // Stop MediaRecorder
    if (recorderRef.current) {
      try { 
        if (recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop() 
        }
      } catch (e) {
        console.warn('Error stopping recorder:', e)
      }
      recorderRef.current = null
    }
    
    // Stop audio stream
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => {
        track.stop()
        console.log('Stopped audio track:', track.label)
      })
      audioStreamRef.current = null
    }
    
    // Close WebSocket
    if (wsRef.current) {
      try { 
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send('end') 
        }
      } catch (e) {
        console.warn('Error sending end message:', e)
      }
      try { 
        wsRef.current.close() 
      } catch (e) {
        console.warn('Error closing WebSocket:', e)
      }
      wsRef.current = null
    }
    
    setIsRecording(false)
    console.log('Voice capture stopped')
  }, [])

  // AI-powered content enhancement
  const enhanceWithAI = useCallback(async (formId: string) => {
    const form = workflowForms.find(f => f.id === formId)
    if (!form || !form.content.trim()) return

    setWorkflowForms(forms => forms.map(f => 
      f.id === formId ? { ...f, isProcessing: true } : f
    ))

    try {
      // Generate title suggestion
      const titleSuggestion = await suggestNoteTitle({ content: form.content })
      
      // Generate summary
      const summaryResult = await generateSummary({ 
        content: form.content,
        maxLength: 150 
      })
      
      // Classify content for tags
      const classificationResult = await classifyContent({ 
        content: form.content 
      })
      
      // Get AI suggestions for improvements
      const improvementResult = await assist({
        context: form.content,
        prompt: 'Suggest 3 specific improvements to make this content more clear, engaging, and actionable.',
        mode: 'suggest',
        maxTokens: 200,
        temperature: 0.4
      })

      const suggestions = {
        title: titleSuggestion || undefined,
        summary: summaryResult?.summary || undefined,
        tags: classificationResult?.suggestedTags || [],
        improvements: improvementResult?.text?.split('\n').filter((line: string) => line.trim()) || []
      }

      setWorkflowForms(forms => forms.map(f => {
        if (f.id !== formId) return f
        const base = { ...f, suggestions, isProcessing: false }
        if (autoEnhancements && suggestions.tags && suggestions.tags.length) {
          const mergedTags = Array.from(new Set([...(f.tags || []), ...suggestions.tags]))
          return { ...base, tags: mergedTags }
        }
        return base
      }))

      // Move to enhancement step if we're in structure
      if (activeStep === 'structure') {
        setActiveStep('enhance')
      }

    } catch (error) {
      console.error('AI enhancement failed:', error)
      setWorkflowForms(forms => forms.map(f => 
        f.id === formId ? { ...f, isProcessing: false } : f
      ))
    }
  }, [workflowForms, activeStep, suggestNoteTitle, generateSummary, classifyContent, assist, autoEnhancements])

  // Auto-enhance after recording stops (when Auto AI is enabled)
  const prevIsRecordingRef = useRef(false)
  useEffect(() => {
    const prev = prevIsRecordingRef.current
    if (prev && !isRecording) {
      if (autoEnhancements && activeFormId) {
        const form = workflowForms.find(f => f.id === activeFormId)
        if (form && form.content.trim()) {
          setActiveStep('structure')
          // Fire-and-forget; internal function will move to enhance step
          enhanceWithAI(activeFormId)
        }
      }
    }
    prevIsRecordingRef.current = isRecording
  }, [isRecording, autoEnhancements, activeFormId, workflowForms, enhanceWithAI])

  // Voice feedback - read content aloud
  const speakContent = useCallback(async (text: string) => {
    if (isSpeaking) {
      // Stop current playback
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setIsSpeaking(false)
      return
    }

    try {
      setIsSpeaking(true)
      const url = await voice.ttsStreamUrl(text)
      const audio = new Audio(url)
      audioRef.current = audio
      
      audio.onended = () => {
        setIsSpeaking(false)
        audioRef.current = null
      }
      
      audio.onerror = () => {
        setIsSpeaking(false)
        audioRef.current = null
      }
      
      await audio.play()
    } catch (error) {
      console.error('Text-to-speech failed:', error)
      setIsSpeaking(false)
    }
  }, [isSpeaking, voice])

  // Voice commands processing with dynamic function calls
  const processVoiceCommand = useCallback(async (command: string) => {
    const cmd = command.toLowerCase().trim()
    
    if (cmd.includes('new note') || cmd.includes('start note')) {
      createNewForm()
      setActiveStep('capture')
    } else if (cmd.includes('enhance') || cmd.includes('improve')) {
      if (activeFormId) {
        await enhanceWithAI(activeFormId)
      }
    } else if (cmd.includes('read') || cmd.includes('speak')) {
      const activeForm = workflowForms.find(f => f.id === activeFormId)
      if (activeForm && activeForm.content) {
        await speakContent(activeForm.content)
      }
    }
    // Note: save and next step commands will be handled by dedicated functions
  }, [activeFormId, workflowForms, createNewForm, enhanceWithAI, speakContent])

  // Save note to backend
  const saveActiveNote = useCallback(async () => {
    const activeForm = workflowForms.find(f => f.id === activeFormId)
    if (!activeForm || !activeForm.content.trim()) return

    try {
      const title = activeForm.title || activeForm.suggestions.title || 'Untitled Note'
      const result = await createNote({ title, content: activeForm.content })
      
      // Remove from forms after successful save
      setWorkflowForms(forms => forms.filter(f => f.id !== activeFormId))
      setActiveFormId(null)
      setActiveStep('capture')
      
      // Speak confirmation
      await speakContent(`Note "${title}" saved successfully`)
      
    } catch (error) {
      console.error('Failed to save note:', error)
      await speakContent('Failed to save note. Please try again.')
    }
  }, [workflowForms, activeFormId, createNote, speakContent])

  // Step navigation
  const moveToNextStep = useCallback(() => {
    const stepIds = workflowSteps.map(s => s.id)
    const currentIndex = stepIds.indexOf(activeStep)
    if (currentIndex < stepIds.length - 1) {
      setActiveStep(stepIds[currentIndex + 1])
    }
  }, [activeStep, workflowSteps])

  const moveToPreviousStep = useCallback(() => {
    const stepIds = workflowSteps.map(s => s.id)
    const currentIndex = stepIds.indexOf(activeStep)
    if (currentIndex > 0) {
      setActiveStep(stepIds[currentIndex - 1])
    }
  }, [activeStep, workflowSteps])

  // Load proactive suggestions on mount
  useEffect(() => {
    if (isAuthenticated) {
      getProactiveSuggestions(5)
        .then(suggestions => setAiSuggestions(suggestions || []))
        .catch(console.error)
    }
  }, [isAuthenticated, getProactiveSuggestions])

  // Auto-create first form
  useEffect(() => {
    if (workflowForms.length === 0) {
      createNewForm()
    }
  }, [workflowForms.length, createNewForm])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoiceCapture()
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [stopVoiceCapture])

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Authentication Required
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Please sign in to access the voice workflow.
          </p>
        </div>
      </div>
    )
  }

  const activeForm = workflowForms.find(f => f.id === activeFormId)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <SparklesIcon className="w-8 h-8 text-purple-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Voice-AI Workflow
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Create notes with voice, enhance with AI
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Voice Recording Indicator */}
              <AnimatePresence>
                {isRecording && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center space-x-2 px-3 py-1 bg-red-100 dark:bg-red-900/30 rounded-full"
                  >
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm text-red-700 dark:text-red-300">Recording</span>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* Auto Enhancement Toggle */}
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoEnhancements}
                  onChange={(e) => setAutoEnhancements(e.target.checked)}
                  className="rounded"
                />
                <span className="text-gray-700 dark:text-gray-300">Auto AI</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Workflow Steps Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Workflow Steps
              </h3>
              
              <div className="space-y-4">
                {workflowSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      step.status === 'active' 
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' 
                        : step.status === 'completed'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                    onClick={() => setActiveStep(step.id)}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        step.status === 'active' 
                          ? 'bg-purple-500 text-white' 
                          : step.status === 'completed'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                      }`}>
                        {step.status === 'completed' ? (
                          <CheckIcon className="w-4 h-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {step.title}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {step.description}
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          {step.voiceSupported && (
                            <MicrophoneIcon className="w-3 h-3 text-blue-500" />
                          )}
                          {step.aiSuggestions && (
                            <SparklesIcon className="w-3 h-3 text-purple-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="mt-6 space-y-2">
                <button
                  onClick={() => createNewForm()}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <FolderPlusIcon className="w-4 h-4" />
                  <span>New Workflow</span>
                </button>
                
                <button
                  onClick={() => activeFormId && speakContent(voiceTranscript || 'No content to read')}
                  disabled={!activeFormId || isSpeaking}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSpeaking ? (
                    <PauseIcon className="w-4 h-4" />
                  ) : (
                    <SpeakerWaveIcon className="w-4 h-4" />
                  )}
                  <span>{isSpeaking ? 'Stop Speaking' : 'Read Aloud'}</span>
                </button>
              </div>
            </div>

            {/* AI Suggestions Panel */}
            {aiSuggestions.length > 0 && (
              <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Proactive Suggestions
                </h3>
                <div className="space-y-3">
                  {aiSuggestions.slice(0, 3).map((suggestion, index) => (
                    <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="font-medium text-sm text-gray-900 dark:text-white">
                        {suggestion.title}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {suggestion.description}
                      </div>
                      {suggestion.estimatedTimeMinutes && (
                        <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                          ~{suggestion.estimatedTimeMinutes}min
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main Workflow Area */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {/* Voice Capture Step */}
              {activeStep === 'capture' && (
                <motion.div
                  key="capture"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        Voice Capture
                      </h2>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={isRecording ? stopVoiceCapture : startVoiceCapture}
                          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                            isRecording 
                              ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/25' 
                              : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/25'
                          }`}
                        >
                          {isRecording ? (
                            <>
                              <motion.div
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1, repeat: Infinity }}
                              >
                                <StopIcon className="w-5 h-5" />
                              </motion.div>
                              <span>Stop Recording</span>
                            </>
                          ) : (
                            <>
                              <MicrophoneIcon className="w-5 h-5" />
                              <span>Start Recording</span>
                            </>
                          )}
                        </button>
                        
                        <button
                          onClick={moveToNextStep}
                          disabled={!activeForm?.content}
                          className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <span>Next Step</span>
                          <ArrowPathIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Live Transcript */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 min-h-[200px]">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Live Transcript:
                      </div>
                      <div className="text-gray-900 dark:text-white leading-relaxed">
                        {voiceTranscript || (isRecording ? 'Listening...' : 'Click "Start Recording" to begin voice capture')}
                        {isRecording && (
                          <motion.span
                            animate={{ opacity: [1, 0] }}
                            transition={{ duration: 1, repeat: Infinity }}
                            className="inline-block w-2 h-5 bg-purple-500 ml-1"
                          />
                        )}
                      </div>
                    </div>

                    {/* Error Display */}
                    {voiceError && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800"
                      >
                        <div className="flex items-center space-x-2">
                          <ExclamationTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
                          <div className="text-sm text-red-800 dark:text-red-200">
                            {voiceError}
                          </div>
                          <button
                            title="Dismiss error"
                            onClick={() => setVoiceError(null)}
                            className="ml-auto text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* Voice Commands Help */}
                    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                      <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                        Voice Commands:
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300 grid grid-cols-2 gap-2">
                        <div>&quot;New note&quot; - Start fresh</div>
                        <div>&quot;Enhance&quot; - Apply AI suggestions</div>
                        <div>&quot;Read aloud&quot; - Text-to-speech</div>
                        <div>&quot;Save note&quot; - Save to library</div>
                        <div>&quot;Next step&quot; - Move forward</div>
                        <div>&quot;Improve&quot; - Get suggestions</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* AI Structure Step */}
              {activeStep === 'structure' && activeForm && (
                <motion.div
                  key="structure"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        AI Structure & Organization
                      </h2>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => enhanceWithAI(activeForm.id)}
                          disabled={activeForm.isProcessing || !activeForm.content}
                          className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {activeForm.isProcessing ? (
                            <>
                              <ArrowPathIcon className="w-5 h-5 animate-spin" />
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <SparklesIcon className="w-5 h-5" />
                              <span>Enhance with AI</span>
                            </>
                          )}
                        </button>
                        
                        <button
                          onClick={moveToNextStep}
                          disabled={!activeForm.suggestions.title}
                          className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <span>Next Step</span>
                          <ArrowPathIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Content Editor */}
                    <NoteEditorAI
                      initialContent={activeForm.content}
                      placeholder="Your captured content will appear here..."
                      onChange={(content) => {
                        setWorkflowForms(forms => forms.map(f => 
                          f.id === activeForm.id ? { ...f, content } : f
                        ))
                        setVoiceTranscript(content)
                      }}
                      className="mb-6"
                    />

                    {/* AI Suggestions Display */}
                    {Object.keys(activeForm.suggestions).length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Title Suggestion */}
                        {activeForm.suggestions.title && (
                          <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-purple-900 dark:text-purple-100">
                                Suggested Title
                              </h4>
                              <button
                                onClick={() => speakContent(activeForm.suggestions.title!)}
                                className="p-1 text-purple-600 hover:text-purple-800 dark:text-purple-400"
                                title="Read title aloud"
                              >
                                <SpeakerWaveIcon className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-purple-800 dark:text-purple-200">
                              {activeForm.suggestions.title}
                            </div>
                            <button
                              onClick={() => {
                                setWorkflowForms(forms => forms.map(f => 
                                  f.id === activeForm.id 
                                    ? { ...f, title: activeForm.suggestions.title! }
                                    : f
                                ))
                              }}
                              className="mt-2 text-sm text-purple-600 hover:text-purple-800 dark:text-purple-400"
                            >
                              Apply Title
                            </button>
                          </div>
                        )}

                        {/* Summary */}
                        {activeForm.suggestions.summary && (
                          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                                AI Summary
                              </h4>
                              <button
                                onClick={() => speakContent(activeForm.suggestions.summary!)}
                                className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400"
                                title="Read summary aloud"
                              >
                                <SpeakerWaveIcon className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-blue-800 dark:text-blue-200 text-sm">
                              {activeForm.suggestions.summary}
                            </div>
                          </div>
                        )}

                        {/* Tags */}
                        {activeForm.suggestions.tags && activeForm.suggestions.tags.length > 0 && (
                          <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4">
                            <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
                              Suggested Tags
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {activeForm.suggestions.tags.map((tag, index) => (
                                <button
                                  key={index}
                                  onClick={() => {
                                    setWorkflowForms(forms => forms.map(f => 
                                      f.id === activeForm.id 
                                        ? { ...f, tags: [...f.tags, tag] }
                                        : f
                                    ))
                                  }}
                                  className="px-3 py-1 bg-green-200 dark:bg-green-700 text-green-800 dark:text-green-200 rounded-full text-sm hover:bg-green-300 dark:hover:bg-green-600 transition-colors"
                                >
                                  <TagIcon className="w-3 h-3 inline mr-1" />
                                  {tag}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Improvements */}
                        {activeForm.suggestions.improvements && activeForm.suggestions.improvements.length > 0 && (
                          <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-4">
                            <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-2">
                              Improvement Suggestions
                            </h4>
                            <div className="space-y-2">
                              {activeForm.suggestions.improvements.map((improvement, index) => (
                                <div key={index} className="text-amber-800 dark:text-amber-200 text-sm">
                                  • {improvement}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Enhancement Step */}
              {activeStep === 'enhance' && activeForm && (
                <motion.div
                  key="enhance"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        Smart Enhancement
                      </h2>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => speakContent(activeForm.content)}
                          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                          <SpeakerWaveIcon className="w-5 h-5" />
                          <span>Listen</span>
                        </button>
                        
                        <button
                          onClick={moveToNextStep}
                          className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                          <span>Finalize</span>
                          <ArrowPathIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Enhanced Editor with all AI features */}
                    <NoteEditorAI
                      initialContent={activeForm.content}
                      placeholder="Enhance your content with AI suggestions..."
                      onChange={(content) => {
                        setWorkflowForms(forms => forms.map(f => 
                          f.id === activeForm.id ? { ...f, content } : f
                        ))
                      }}
                      className="mb-6"
                    />

                    {/* Form Metadata */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Title
                        </label>
                        <input
                          type="text"
                          value={activeForm.title || activeForm.suggestions.title || ''}
                          onChange={(e) => {
                            setWorkflowForms(forms => forms.map(f => 
                              f.id === activeForm.id ? { ...f, title: e.target.value } : f
                            ))
                          }}
                          placeholder="Enter note title..."
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tags
                        </label>
                        <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                          {activeForm.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-3 py-1 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded-full text-sm"
                            >
                              {tag}
                              <button
                                onClick={() => {
                                  setWorkflowForms(forms => forms.map(f => 
                                    f.id === activeForm.id 
                                      ? { ...f, tags: f.tags.filter((_, i) => i !== index) }
                                      : f
                                  ))
                                }}
                                className="ml-2 text-purple-500 hover:text-purple-700"
                                title="Remove tag"
                              >
                                <XMarkIcon className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Finalize Step */}
              {activeStep === 'finalize' && activeForm && (
                <motion.div
                  key="finalize"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        Voice Review & Finalize
                      </h2>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={moveToPreviousStep}
                          className="flex items-center space-x-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                        >
                          <span>Back</span>
                        </button>
                        
                        <button
                          onClick={saveActiveNote}
                          className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                          <BookmarkIcon className="w-5 h-5" />
                          <span>Save Note</span>
                        </button>
                      </div>
                    </div>

                    {/* Final Review */}
                    <div className="space-y-6">
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          {activeForm.title || 'Untitled Note'}
                        </h3>
                        
                        {activeForm.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {activeForm.tags.map((tag, index) => (
                              <span
                                key={index}
                                className="px-3 py-1 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded-full text-sm"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        <div className="prose dark:prose-invert max-w-none">
                          {activeForm.content.split('\n').map((paragraph, index) => (
                            <p key={index} className="mb-4 text-gray-900 dark:text-white">
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>

                      {/* Voice Review Controls */}
                      <div className="flex items-center justify-center space-x-4">
                        <button
                          onClick={() => speakContent(activeForm.content)}
                          disabled={isSpeaking}
                          className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {isSpeaking ? (
                            <>
                              <PauseIcon className="w-5 h-5" />
                              <span>Stop Reading</span>
                            </>
                          ) : (
                            <>
                              <PlayIcon className="w-5 h-5" />
                              <span>Read Full Note</span>
                            </>
                          )}
                        </button>
                        
                        {activeForm.suggestions.summary && (
                          <button
                            onClick={() => speakContent(activeForm.suggestions.summary!)}
                            className="flex items-center space-x-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                          >
                            <ClipboardDocumentListIcon className="w-5 h-5" />
                            <span>Read Summary</span>
                          </button>
                        )}
                      </div>

                      {/* Final Statistics */}
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4">
                          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            {activeForm.content.split(' ').length}
                          </div>
                          <div className="text-sm text-blue-700 dark:text-blue-300">Words</div>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-4">
                          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                            {activeForm.tags.length}
                          </div>
                          <div className="text-sm text-purple-700 dark:text-purple-300">Tags</div>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4">
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {Math.ceil(activeForm.content.length / 100)}
                          </div>
                          <div className="text-sm text-green-700 dark:text-green-300">Est. Reading Time (s)</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
