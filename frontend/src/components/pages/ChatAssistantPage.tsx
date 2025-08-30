'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MicrophoneIcon,
  SpeakerWaveIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
  StopIcon,
  PlayIcon
} from '@heroicons/react/24/outline'
import { useMascot } from '@/contexts/MascotContext'
import { useChatToolsApi, useVoiceApi } from '@/services/apiClient'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  citations?: Citation[]
  toolResults?: ToolResult[]
}

interface Citation {
  noteId: string
  title: string
  excerpt: string
  score: number
}

interface ToolResult {
  tool: string
  success: boolean
  result?: any
  error?: string
}

interface Tool {
  name: string
  description: string
  icon: React.ComponentType<any>
}

const ChatAssistantPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [currentInput, setCurrentInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [availableTools, setAvailableTools] = useState<Tool[]>([])
  const [conversationId, setConversationId] = useState<string>()
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null)
  
  const { speak, listen, think, respond, idle, suggest } = useMascot()
  const { processChat, executeTool, getAvailableTools } = useChatToolsApi()
  const voiceApi = useVoiceApi()

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesisRef.current = window.speechSynthesis
    }
  }, [])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load available tools
  useEffect(() => {
    const loadTools = async () => {
      try {
        const tools: any = await getAvailableTools()
        setAvailableTools(Array.isArray(tools) ? tools : [])
      } catch (error) {
        console.error('Failed to load tools:', error)
        setAvailableTools([])
      }
    }
    
    loadTools()
  }, [getAvailableTools])

  // Initialize conversation with greeting
  useEffect(() => {
    const welcomeMessage: Message = {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I'm your AI assistant. I can help you search your knowledge base, answer questions, and use various tools. You can type your message or use voice input. How can I help you today?",
      timestamp: new Date(),
    }
    setMessages([welcomeMessage])
    speak("Hi there! I'm ready to help you explore your knowledge base. What would you like to know?")
  }, [speak])

  // Voice recognition setup
  const startVoiceInput = useCallback(() => {
    if (!('webkitSpeechRecognition' in window)) {
      speak("Sorry, voice input is not supported in your browser", 'error')
      return
    }

    setIsListening(true)
    listen()

    if (!recognitionRef.current) {
      recognitionRef.current = new (window as any).webkitSpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'en-US'
    }

    recognitionRef.current.onstart = () => {
      speak("I'm listening...")
    }

    recognitionRef.current.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setCurrentInput(transcript)
      setIsListening(false)
      idle()
      
      // Automatically send the message
      handleSendMessage(transcript)
    }

    recognitionRef.current.onerror = () => {
      speak("Sorry, I couldn't hear you clearly. Try again!", 'error')
      setIsListening(false)
      idle()
    }

    recognitionRef.current.onend = () => {
      setIsListening(false)
      idle()
    }

    recognitionRef.current.start()
  }, [speak, listen, idle])

  // Stop voice input
  const stopVoiceInput = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
      idle()
    }
  }

  // Text-to-speech for responses
  const speakResponse = useCallback(
    async (text: string) => {
      setIsSpeaking(true)
      respond()

      // Try backend TTS first
      try {
        const audioBlob = await voiceApi.tts(text)
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        audio.onended = () => {
          setIsSpeaking(false)
          idle()
          URL.revokeObjectURL(audioUrl)
        }
        await audio.play()
        return
      } catch (error) {
        console.warn('Backend TTS failed, falling back to browser TTS:', error)
      }

      // Fallback to browser TTS if available
      if (speechSynthesisRef.current) {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.9
        utterance.pitch = 1.0
        utterance.volume = 0.8
        utterance.onend = () => {
          setIsSpeaking(false)
          idle()
        }
        speechSynthesisRef.current.speak(utterance)
      } else {
        // As a last resort, just stop speaking state
        setIsSpeaking(false)
        idle()
      }
    },
    [respond, idle, voiceApi]
  )

  // Stop speaking
  const stopSpeaking = () => {
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel()
      setIsSpeaking(false)
      idle()
    }
  }

  // Send message to AI
  const handleSendMessage = async (messageText: string = currentInput) => {
    if (!messageText.trim() || isProcessing) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setCurrentInput('')
    setIsProcessing(true)
    think()

    try {
      // Prepare messages for RAG
      const conversationMessages = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // Send to RAG endpoint
      const response: any = await processChat({
        messages: conversationMessages,
        temperature: 0.7,
        maxTokens: 500,
        useRag: true
      } as any)

      const assistantMessage: Message = {
        id: Date.now().toString() + '_assistant',
        role: 'assistant',
        content: response.answer || "I'm sorry, I couldn't process your request right now.",
        timestamp: new Date(),
        citations: response.citations || [],
        toolResults: response.toolResults || []
      }

      setMessages(prev => [...prev, assistantMessage])
      
      // Speak the response
      await speakResponse(assistantMessage.content)
      
      // Update conversation ID if provided
      if (response.conversationId) {
        setConversationId(response.conversationId)
      }

      // Show mascot suggestion if no citations
      if (!response.citations?.length) {
        setTimeout(() => {
          suggest("Try asking more specific questions or uploading relevant documents for better answers!")
        }, 2000)
      }

    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        id: Date.now().toString() + '_error',
        role: 'assistant',
        content: "I'm sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
      speak("Oops! Something went wrong. Please try asking again.", 'error')
    } finally {
      setIsProcessing(false)
      idle()
    }
  }

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSendMessage()
  }

  // Clear conversation
  const clearConversation = () => {
    setMessages([])
    setConversationId(undefined)
    speak("Conversation cleared! How can I help you now?")
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Chat Assistant
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Ask questions, get insights, and explore your knowledge base
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {availableTools.length > 0 && (
              <div className="flex items-center gap-2">
                <WrenchScrewdriverIcon className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {availableTools.length} tools available
                </span>
              </div>
            )}
            
            <button
              onClick={clearConversation}
              className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Clear Chat
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.1 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3xl rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                      <SparklesIcon className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </p>
                    
                    {/* Citations */}
                    {message.citations && message.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                          Sources:
                        </p>
                        <div className="space-y-2">
                          {message.citations.map((citation, idx) => (
                            <div key={idx} className="bg-gray-50 dark:bg-gray-700 rounded p-2">
                              <div className="flex items-center gap-2 mb-1">
                                <DocumentTextIcon className="w-3 h-3 text-gray-500" />
                                <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                                  {citation.title}
                                </span>
                                <span className="text-xs text-gray-500">
                                  ({(citation.score * 100).toFixed(1)}% match)
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                {citation.excerpt}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Tool Results */}
                    {message.toolResults && message.toolResults.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                          Tools used:
                        </p>
                        <div className="space-y-1">
                          {message.toolResults.map((tool, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <WrenchScrewdriverIcon className="w-3 h-3 text-gray-500" />
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                {tool.tool}
                              </span>
                              <span className={`text-xs ${tool.success ? 'text-green-600' : 'text-red-600'}`}>
                                {tool.success ? '✓' : '✗'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <SparklesIcon className="w-4 h-4 text-white" />
                  </motion.div>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 bg-gray-400 rounded-full"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.2,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <div className="flex-1">
            <textarea
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder="Ask me anything... (Press Shift+Enter for new line)"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[44px] max-h-[120px]"
              rows={1}
              disabled={isProcessing}
            />
          </div>
          
          {/* Voice Input Button */}
          <motion.button
            type="button"
            onClick={isListening ? stopVoiceInput : startVoiceInput}
            disabled={isProcessing}
            className={`p-3 rounded-lg transition-colors ${
              isListening
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                : 'bg-purple-100 dark:bg-purple-800 hover:bg-purple-200 dark:hover:bg-purple-700 text-purple-600 dark:text-purple-300'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <MicrophoneIcon className="w-5 h-5" />
          </motion.button>

          {/* TTS Control */}
          <motion.button
            type="button"
            onClick={isSpeaking ? stopSpeaking : undefined}
            disabled={!isSpeaking}
            className={`p-3 rounded-lg transition-colors ${
              isSpeaking
                ? 'bg-orange-500 hover:bg-orange-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
            whileHover={isSpeaking ? { scale: 1.05 } : {}}
            whileTap={isSpeaking ? { scale: 0.95 } : {}}
          >
            {isSpeaking ? <StopIcon className="w-5 h-5" /> : <SpeakerWaveIcon className="w-5 h-5" />}
          </motion.button>
          
          {/* Send Button */}
          <motion.button
            type="submit"
            disabled={!currentInput.trim() || isProcessing}
            className="p-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </motion.button>
        </form>
      </div>
    </div>
  )
}

export default ChatAssistantPage
