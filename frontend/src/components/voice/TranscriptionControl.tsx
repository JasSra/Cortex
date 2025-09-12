'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MicrophoneIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
  SpeakerWaveIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'

interface TranscriptionControlProps {
  onTranscript?: (text: string) => void
  onStreamingText?: (text: string, isPartial: boolean) => void
  className?: string
  autoStart?: boolean
  showPlayback?: boolean
  streamingMode?: boolean
}

type TranscriptionStatus = 'idle' | 'processing' | 'listening' | 'paused' | 'stopped' | 'error'

export default function TranscriptionControl({
  onTranscript,
  onStreamingText,
  className = '',
  autoStart = false,
  showPlayback = true,
  streamingMode = false
}: TranscriptionControlProps) {
  // State management
  const [status, setStatus] = useState<TranscriptionStatus>('idle')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [accumulatedText, setAccumulatedText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPermissionGranted, setIsPermissionGranted] = useState(false)
  const [isPlayingTest, setIsPlayingTest] = useState(false)

  // Refs for managing resources
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Auth hook for access tokens
  const { getAccessToken } = useAuth()

  // Update status helper
  const updateStatus = useCallback((newStatus: TranscriptionStatus) => {
    setStatus(newStatus)
    if (newStatus === 'listening') {
      setIsRecording(true)
    } else if (newStatus === 'idle' || newStatus === 'stopped' || newStatus === 'error') {
      setIsRecording(false)
    }
  }, [])

  // Request microphone permission
  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setIsPermissionGranted(true)
      stream.getTracks().forEach(track => track.stop()) // Clean up test stream
      return true
    } catch (error) {
      console.error('Microphone permission denied:', error)
      setError('Microphone permission is required for transcription')
      setIsPermissionGranted(false)
      return false
    }
  }, [])

  // Initialize WebSocket connection
  const initializeWebSocket = useCallback(async (): Promise<WebSocket | null> => {
    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Authentication required')
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/voice/stt?token=${encodeURIComponent(token)}`
      
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.transcript && data.transcript.trim()) {
            const newText = data.transcript.trim()
            const isPartial = data.is_partial || false
            
            setAccumulatedText(prev => {
              const updated = prev + (prev ? ' ' : '') + newText
              return updated
            })
            
            // Stream text immediately if in streaming mode
            if (streamingMode && onStreamingText) {
              onStreamingText(newText, isPartial)
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('Connection error. Please try again.')
        updateStatus('error')
      }

      ws.onclose = () => {
        if (status === 'listening' || status === 'paused') {
          setError('Connection lost. Please restart transcription.')
          updateStatus('error')
        }
      }

      return ws
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error)
      setError('Failed to connect to transcription service')
      return null
    }
  }, [getAccessToken, status, updateStatus, streamingMode, onStreamingText])

  // Initialize media recorder
  const initializeMediaRecorder = useCallback(async (): Promise<MediaRecorder | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      audioStreamRef.current = stream

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm'
      })

      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data)
        }
      }

      recorder.onerror = (error) => {
        console.error('MediaRecorder error:', error)
        setError('Recording error. Please try again.')
        updateStatus('error')
      }

      return recorder
    } catch (error) {
      console.error('Failed to initialize media recorder:', error)
      setError('Failed to access microphone')
      return null
    }
  }, [updateStatus])

  // Cleanup resources
  const cleanup = useCallback(() => {
    // Stop media recorder
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
      } catch (error) {
        console.error('Error stopping media recorder:', error)
      }
      mediaRecorderRef.current = null
    }

    // Stop audio stream
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop())
      audioStreamRef.current = null
    }

    // Close WebSocket
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN || 
            wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close()
        }
      } catch (error) {
        console.error('Error closing WebSocket:', error)
      }
      wsRef.current = null
    }

    // Clear recording timer
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }

    setIsRecording(false)
    setRecordingDuration(0)
  }, [])

  // Start transcription
  const startTranscription = useCallback(async () => {
    if (status !== 'idle' && status !== 'stopped') return

    if (!isPermissionGranted) {
      const granted = await requestPermission()
      if (!granted) return
    }

    setRecordingDuration(0)
    setAccumulatedText('')
    setError(null)

    try {
      updateStatus('processing')

      // Initialize WebSocket and media recorder
      const ws = await initializeWebSocket()
      const recorder = await initializeMediaRecorder()

      if (!ws || !recorder) {
        updateStatus('error')
        return
      }

      // Wait for WebSocket to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000)
        
        if (ws.readyState === WebSocket.OPEN) {
          clearTimeout(timeout)
          resolve()
        } else {
          ws.onopen = () => {
            clearTimeout(timeout)
            resolve()
          }
          ws.onerror = () => {
            clearTimeout(timeout)
            reject(new Error('WebSocket connection failed'))
          }
        }
      })

      // Start recording
      recorder.start(100) // Send data every 100ms for low latency
      updateStatus('listening')

      // Start duration timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
      
    } catch (error) {
      console.error('Failed to start transcription:', error)
      setError('Failed to start transcription. Please try again.')
      updateStatus('error')
      cleanup()
    }
  }, [status, initializeWebSocket, initializeMediaRecorder, updateStatus, cleanup, isPermissionGranted, requestPermission])

  // Pause transcription
  const pauseTranscription = useCallback(() => {
    if (status !== 'listening') return

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause()
    }
    
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
    
    updateStatus('paused')
  }, [status, updateStatus])

  // Resume transcription
  const resumeTranscription = useCallback(() => {
    if (status !== 'paused') return

    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume()
      
      // Restart duration timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
      
      updateStatus('listening')
    }
  }, [status, updateStatus])

  // Stop transcription
  const stopTranscription = useCallback(() => {
    if (status === 'idle' || status === 'stopped') return

    // Send final accumulated text
    if (accumulatedText) {
      onTranscript?.(accumulatedText)
    }

    cleanup()
    updateStatus('stopped')
  }, [status, accumulatedText, onTranscript, updateStatus, cleanup])

  // Test playback (for debugging audio setup)
  const testPlayback = useCallback(async () => {
    if (isPlayingTest) return

    try {
      setIsPlayingTest(true)
      
      // Create a short beep sound for testing
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.5)

      setTimeout(() => {
        setIsPlayingTest(false)
        audioContext.close()
      }, 600)
    } catch (error) {
      console.error('Playback test failed:', error)
      setIsPlayingTest(false)
    }
  }, [isPlayingTest])

  // Auto-start functionality
  useEffect(() => {
    if (autoStart && status === 'idle') {
      startTranscription()
    }
  }, [autoStart, status, startTranscription])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Main Controls */}
      <div className="flex items-center gap-3">
        {/* Start/Stop Button */}
        <motion.button
          onClick={status === 'listening' || status === 'paused' ? stopTranscription : startTranscription}
          disabled={status === 'processing'}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
            ${status === 'listening' || status === 'paused'
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg'
              : status === 'processing'
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl'
            }
          `}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {status === 'processing' ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Connecting...
            </>
          ) : status === 'listening' || status === 'paused' ? (
            <>
              <StopIcon className="w-5 h-5" />
              Stop
            </>
          ) : (
            <>
              <MicrophoneIcon className="w-5 h-5" />
              Start
            </>
          )}
        </motion.button>

        {/* Pause/Resume Button */}
        {(status === 'listening' || status === 'paused') && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={status === 'listening' ? pauseTranscription : resumeTranscription}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {status === 'listening' ? (
              <>
                <PauseIcon className="w-4 h-4" />
                Pause
              </>
            ) : (
              <>
                <PlayIcon className="w-4 h-4" />
                Resume
              </>
            )}
          </motion.button>
        )}

        {/* Test Playback Button */}
        {showPlayback && status === 'idle' && (
          <motion.button
            onClick={testPlayback}
            disabled={isPlayingTest}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-500 hover:bg-gray-600 text-white transition-colors disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <SpeakerWaveIcon className={`w-4 h-4 ${isPlayingTest ? 'animate-pulse' : ''}`} />
            Test Audio
          </motion.button>
        )}
      </div>

      {/* Status Display */}
      <div className="space-y-3">
        {/* Recording Status */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className={`
              w-3 h-3 rounded-full
              ${status === 'listening' ? 'bg-red-500 animate-pulse' : 
                status === 'paused' ? 'bg-yellow-500' :
                status === 'processing' ? 'bg-blue-500 animate-pulse' :
                status === 'stopped' ? 'bg-green-500' :
                status === 'error' ? 'bg-red-600' : 'bg-gray-400'}
            `} />
            <span className="font-medium capitalize text-gray-700 dark:text-gray-300">
              {status === 'idle' ? 'Ready' : 
               status === 'processing' ? 'Connecting' :
               status === 'listening' ? 'Listening' :
               status === 'paused' ? 'Paused' :
               status === 'stopped' ? 'Completed' :
               status === 'error' ? 'Error' : status}
            </span>
          </div>
          
          {isRecording && (
            <span className="text-gray-600 dark:text-gray-400 font-mono">
              {formatDuration(recordingDuration)}
            </span>
          )}
        </div>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
            >
              <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcript Preview */}
        {accumulatedText && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircleIcon className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Live Transcript
              </span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 max-h-24 overflow-y-auto">
              {accumulatedText}
            </div>
          </motion.div>
        )}

        {/* Instructions */}
        {status === 'idle' && !error && (
          <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
            <p>Click &ldquo;Start&rdquo; to begin voice transcription</p>
          </div>
        )}
      </div>
    </div>
  )
}
