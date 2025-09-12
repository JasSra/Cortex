'use client'

import React, { useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  MicrophoneIcon,
  SpeakerWaveIcon,
  StopIcon,
  PlayIcon
} from '@heroicons/react/24/outline'
import { useVoiceApi } from '@/services/apiClient'
import { WebSocketSTTService } from '@/services/websocketSTT'

export default function VoiceTestPage() {
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [ttsText, setTtsText] = useState('Hello! This is a test of the text-to-speech system.')
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  const voiceApi = useVoiceApi()
  const sttServiceRef = useRef<WebSocketSTTService | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }, [])

  const clearError = useCallback(() => setError(null), [])

  // Text-to-Speech Test
  const testTTS = useCallback(async () => {
    if (!ttsText.trim()) return
    
    setIsSpeaking(true)
    setError(null)
    addLog('Starting TTS test...')
    
    try {
      // Test streaming TTS
      const streamUrl = await voiceApi.ttsStreamUrl(ttsText)
      addLog(`TTS stream URL: ${streamUrl}`)
      
      const audio = new Audio(streamUrl)
      audioRef.current = audio
      
      audio.onloadstart = () => addLog('TTS audio loading...')
      audio.oncanplay = () => addLog('TTS audio ready to play')
      audio.onplay = () => addLog('TTS audio playing')
      audio.onended = () => {
        addLog('TTS audio finished')
        setIsSpeaking(false)
      }
      audio.onerror = (e) => {
        addLog(`TTS audio error: ${e}`)
        setIsSpeaking(false)
        setError('Failed to play TTS audio')
      }
      
      await audio.play()
    } catch (err: any) {
      addLog(`TTS error: ${err.message}`)
      setError(`TTS failed: ${err.message}`)
      setIsSpeaking(false)
    }
  }, [ttsText, voiceApi, addLog])

  const stopTTS = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsSpeaking(false)
    addLog('TTS stopped')
  }, [addLog])

  // Speech-to-Text Test
  const startSTT = useCallback(async () => {
    setIsRecording(true)
    setError(null)
    setTranscript('')
    addLog('Starting STT test...')
    
    try {
      const sttService = await voiceApi.createSTTWebSocket()
      sttServiceRef.current = sttService
      
      addLog('STT WebSocket service created')
      
      await sttService.startRecording(
        (text: string) => {
          addLog(`STT result: "${text}"`)
          setTranscript(prev => prev ? `${prev} ${text}` : text)
        },
        (error: string) => {
          addLog(`STT error: ${error}`)
          setError(`STT error: ${error}`)
          setIsRecording(false)
        }
      )
      
      addLog('STT recording started successfully')
    } catch (err: any) {
      addLog(`STT start error: ${err.message}`)
      setError(`Failed to start STT: ${err.message}`)
      setIsRecording(false)
    }
  }, [voiceApi, addLog])

  const stopSTT = useCallback(() => {
    if (sttServiceRef.current) {
      sttServiceRef.current.stopRecording()
      addLog('STT recording stopped')
    }
    setIsRecording(false)
  }, [addLog])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const testVoiceConfig = useCallback(async () => {
    addLog('Testing voice configuration...')
    try {
      const result = await voiceApi.validateConfig({
        voiceLanguage: 'en-US',
        voiceSpeed: 1.0,
        voiceVolume: 1.0,
        microphoneSensitivity: 0.5,
        continuousListening: false
      })
      addLog(`Voice config validation: ${JSON.stringify(result)}`)
    } catch (err: any) {
      addLog(`Voice config error: ${err.message}`)
      setError(`Voice config failed: ${err.message}`)
    }
  }, [voiceApi, addLog])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Voice System Test
            </h1>
            <p className="text-gray-600 dark:text-slate-400">
              Test the Speech-to-Text and Text-to-Speech functionality
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg"
            >
              <p className="text-red-800 dark:text-red-300 font-medium">Error</p>
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              <button
                onClick={clearError}
                className="mt-2 text-red-600 dark:text-red-400 text-sm underline hover:no-underline"
              >
                Dismiss
              </button>
            </motion.div>
          )}

          {/* TTS Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Text-to-Speech Test
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Text to speak:
                </label>
                <textarea
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  rows={3}
                  placeholder="Enter text to convert to speech..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={testTTS}
                  disabled={isSpeaking || !ttsText.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                >
                  <PlayIcon className="w-5 h-5" />
                  {isSpeaking ? 'Speaking...' : 'Test TTS'}
                </button>
                {isSpeaking && (
                  <button
                    onClick={stopTTS}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    <StopIcon className="w-5 h-5" />
                    Stop
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* STT Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Speech-to-Text Test
            </h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <button
                  onClick={isRecording ? stopSTT : startSTT}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <StopIcon className="w-5 h-5" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <MicrophoneIcon className="w-5 h-5" />
                      Start Recording
                    </>
                  )}
                </button>
              </div>
              {transcript && (
                <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    Transcription:
                  </p>
                  <p className="text-gray-900 dark:text-white">{transcript}</p>
                </div>
              )}
            </div>
          </div>

          {/* Voice Config Test */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Voice Configuration Test
            </h2>
            <button
              onClick={testVoiceConfig}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              <SpeakerWaveIcon className="w-5 h-5" />
              Test Voice Config
            </button>
          </div>

          {/* Logs Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Logs
              </h2>
              <button
                onClick={clearLogs}
                className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
              >
                Clear Logs
              </button>
            </div>
            <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4 max-h-64 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-gray-500 dark:text-slate-400 text-sm">
                  No logs yet. Try testing the voice functionality above.
                </p>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, index) => (
                    <p key={index} className="text-sm font-mono text-gray-700 dark:text-slate-300">
                      {log}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
