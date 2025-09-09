'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  PaperAirplaneIcon,
  MicrophoneIcon,
  DocumentPlusIcon,
  Cog6ToothIcon,
  UserIcon,
  SparklesIcon,
  StopIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  XCircleIcon
} from '@heroicons/react/24/outline'
import { useCortexStore } from '../../store/cortexStore'
import { useChatApi } from '../../services/apiClient'
import { useAuth } from '@/contexts/AuthContext'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  attachments?: Array<{
    id: string
    name: string
    type: string
    url: string
  }>
  metadata?: {
    citations?: Array<{
      NoteId: string;
      ChunkId: string;
      Offsets: number[];
    }>
  }
}

interface ChatMessage {
  message: Message
  isTyping?: boolean
}

const ChatMessage = ({ message, isTyping = false }: ChatMessage) => {
  const isUser = message.role === 'user'
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}
    >
      <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start space-x-3`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser 
            ? 'bg-gradient-to-br from-blue-500 to-blue-600' 
            : 'bg-gradient-to-br from-purple-500 to-purple-600'
        }`}>
          {isUser ? (
            <UserIcon className="h-4 w-4 text-white" />
          ) : (
            <SparklesIcon className="h-4 w-4 text-white" />
          )}
        </div>

        {/* Message */}
        <div className={`relative ${isUser ? 'mr-3' : 'ml-3'}`}>
          <div className={`p-4 rounded-2xl shadow-sm ${
            isUser 
              ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' 
              : 'bg-white/80 backdrop-blur-sm border border-gray-200/50 text-gray-900'
          }`}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
              {isTyping && (
                <motion.span
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="inline-block ml-1"
                >
                  |
                </motion.span>
              )}
            </p>
            
            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {message.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center space-x-2 p-2 rounded-lg bg-black/10"
                  >
                    <DocumentPlusIcon className="h-4 w-4" />
                    <span className="text-xs font-medium">{attachment.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Citations */}
            {message.metadata?.citations && message.metadata.citations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200/30">
                <p className="text-xs font-medium mb-2 opacity-80">Sources:</p>
                <div className="space-y-1">
                  {message.metadata.citations.map((citation, index) => (
                    <div
                      key={`${citation.NoteId}-${citation.ChunkId}`}
                      className="text-xs opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
                      title={`Note: ${citation.NoteId}, Chunk: ${citation.ChunkId}`}
                    >
                      <span className="font-mono">#{index + 1}</span> {citation.NoteId}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Timestamp and Actions */}
          <div className={`flex items-center gap-2 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <p className="text-xs text-gray-500">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {isUser && (
              <button
                onClick={() => {
                  // Re-send the message
                  const event = new CustomEvent('resendMessage', { detail: message.content })
                  window.dispatchEvent(event)
                }}
                className="p-1 hover:bg-gray-100 rounded opacity-50 hover:opacity-100 transition-opacity"
                title="Resend this message"
              >
                <ArrowPathIcon className="w-3 h-3 text-gray-500" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

const TypingIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex justify-start mb-6"
  >
    <div className="flex items-start space-x-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
        <SparklesIcon className="h-4 w-4 text-white" />
      </div>
      <div className="bg-white/80 backdrop-blur-sm border border-gray-200/50 p-4 rounded-2xl">
        <div className="flex space-x-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ 
                repeat: Infinity, 
                duration: 1.5, 
                delay: i * 0.2,
                ease: "easeInOut"
              }}
              className="w-2 h-2 bg-gray-400 rounded-full"
            />
          ))}
        </div>
      </div>
    </div>
  </motion.div>
)

export default function ModernChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm your Cortex AI assistant. I can help you search through your documents, answer questions about your knowledge base, and assist with various tasks. What would you like to know?",
      timestamp: new Date()
    }
  ])
  
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(true)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  
  const { isAuthenticated } = useAuth()
  const { chatMessages, addChatMessage, isLoading } = useCortexStore()
  const chatApi = useChatApi()

  // Enhanced error handling
  const showError = useCallback((message: string, duration = 5000) => {
    setError(message)
    setTimeout(() => setError(null), duration)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Handle resend message event
  useEffect(() => {
    const handleResendMessage = (event: any) => {
      const content = event.detail
      setInput(content)
      inputRef.current?.focus()
    }

    window.addEventListener('resendMessage', handleResendMessage)
    return () => window.removeEventListener('resendMessage', handleResendMessage)
  }, [])

  const handleSendMessage = useCallback(async () => {
    if (!input.trim()) return

    // Clear any previous errors
    clearError()

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    const currentInput = input.trim()
    setInput('')
    setIsTyping(true)

    try {
      // Convert messages to API format - backend expects [role, content] tuples
      const messageHistory = [...messages, userMessage].map(msg => [msg.role, msg.content] as [string, string])

      // Use RAG query for knowledge-based chat
      const response = await chatApi.ragQuery(messageHistory.map(([role, content]) => ({ role, content })))
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer || response.Answer || 'I apologize, but I couldn\'t find relevant information to answer your question.',
        timestamp: new Date(),
        // Store citations if available
        metadata: response.citations || response.Citations ? { 
          citations: response.citations || response.Citations || [] 
        } : undefined
      }

      setMessages(prev => [...prev, assistantMessage])
      setIsConnected(true)
    } catch (error: any) {
      console.error('Error sending message:', error)
      setIsConnected(false)
      
      const errorMessage = error?.message || 'An unexpected error occurred'
      showError(`Failed to send message: ${errorMessage}`)
      
      // Add error message to chat
      const errorChatMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error while processing your request. Please check your connection and try again.',
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, errorChatMessage])
    } finally {
      setIsTyping(false)
    }
  }, [input, messages, chatApi, clearError, showError])

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }, [handleSendMessage])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    // Handle file upload logic here
    console.log('Files selected:', files)
    showError('File upload feature coming soon!')
  }, [showError])

  const toggleRecording = useCallback(() => {
    if (!isRecording) {
      // Start recording
      if (!(globalThis as any).webkitSpeechRecognition && !(globalThis as any).SpeechRecognition) {
        showError("Voice input is not supported in this browser.")
        return
      }

      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true
        recognitionRef.current.lang = 'en-US'

        let finalTranscript = ''
        recognitionRef.current.onresult = (event: any) => {
          let interim = ''
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript
            } else {
              interim += transcript
            }
          }
          
          if (finalTranscript.trim()) {
            setInput(finalTranscript.trim())
            finalTranscript = ''
          }
        }

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error)
          setIsRecording(false)
          showError(`Voice recognition failed: ${event.error}`)
        }

        recognitionRef.current.onend = () => {
          setIsRecording(false)
        }

        recognitionRef.current.start()
        setIsRecording(true)
      } catch (error: any) {
        showError(`Failed to start voice recognition: ${error.message}`)
      }
    } else {
      // Stop recording
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      setIsRecording(false)
    }
  }, [isRecording, showError])

  // Check authentication
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-blue-50/30">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg font-medium text-gray-900 mb-2">
              Authentication Required
            </div>
            <div className="text-sm text-gray-600">
              Please sign in to use the chat interface
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-blue-50/30">
      {/* Enhanced Chat Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between p-6 bg-white/80 backdrop-blur-sm border-b border-gray-200/50"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
            <SparklesIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cortex Assistant</h2>
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-500">AI-powered knowledge companion</p>
              {isConnected ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                  <CheckCircleIcon className="w-3 h-3" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-red-600">
                  <XCircleIcon className="w-3 h-3" />
                  Disconnected
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Settings"
          >
            <Cog6ToothIcon className="h-5 w-5 text-gray-600" />
          </motion.button>
        </div>
      </motion.div>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="px-6 py-3 bg-red-50 border-b border-red-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-800">{error}</span>
              </div>
              <button
                onClick={clearError}
                className="p-1 hover:bg-red-100 rounded"
              >
                <XCircleIcon className="w-4 h-4 text-red-600" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <AnimatePresence>
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isTyping && <TypingIndicator />}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 bg-white/80 backdrop-blur-sm border-t border-gray-200/50"
      >
        <div className="flex items-end space-x-4">
          {/* File Upload */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
            title="Attach file"
          >
            <DocumentPlusIcon className="h-5 w-5 text-gray-600" />
          </motion.button>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Message Input */}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything about your documents..."
              className="w-full p-4 pr-12 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none max-h-32 bg-white/70 backdrop-blur-sm"
              rows={1}
              style={{ 
                minHeight: '56px',
                height: Math.min(Math.max(56, input.split('\n').length * 24 + 32), 128) + 'px'
              }}
            />
          </div>

          {/* Voice Recording */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={toggleRecording}
            className={`p-3 rounded-xl transition-all duration-200 ${
              isRecording 
                ? 'bg-red-500 text-white animate-pulse' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            }`}
            title={isRecording ? "Stop recording" : "Start voice message"}
          >
            {isRecording ? (
              <StopIcon className="h-5 w-5" />
            ) : (
              <MicrophoneIcon className="h-5 w-5" />
            )}
          </motion.button>

          {/* Send Button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleSendMessage}
            disabled={!input.trim() || isTyping}
            className={`p-3 rounded-xl transition-all duration-200 ${
              input.trim() && !isTyping
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            title="Send message"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </motion.button>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            "Search my documents",
            "Summarize recent uploads",
            "Show knowledge graph",
            "What's trending?",
          ].map((suggestion, index) => (
            <motion.button
              key={suggestion}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setInput(suggestion)}
              className="px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
            >
              {suggestion}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
