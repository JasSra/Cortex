// WebSocket-based Speech-to-Text service for real-time audio processing
export class WebSocketSTTService {
  private ws: WebSocket | null = null
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private isRecording = false
  private onTranscription?: (text: string) => void
  private onError?: (error: string) => void

  constructor(
    private baseUrl: string,
    private getAccessToken: () => Promise<string | null>
  ) {}

  async startRecording(
    onTranscription: (text: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    this.onTranscription = onTranscription
    this.onError = onError

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      // Setup WebSocket connection
      await this.connectWebSocket()

      // Setup media recorder
      this.setupMediaRecorder(stream)

      this.mediaRecorder?.start(100) // Send chunks every 100ms
      this.isRecording = true
    } catch (error: any) {
      onError(`Failed to start recording: ${error.message}`)
      throw error
    }
  }

  stopRecording(): void {
    this.isRecording = false
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send END signal to process accumulated audio
      this.ws.send('END')
    }
  }

  disconnect(): void {
    this.stopRecording()
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private async connectWebSocket(): Promise<void> {
    const token = await this.getAccessToken()
    let wsUrl = this.baseUrl.replace('http', 'ws') + '/api/voice/stt'
    
    // Add token as query parameter for WebSocket authentication
    if (token) {
      wsUrl += `?access_token=${encodeURIComponent(token)}`
    }
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl)
      
      this.ws.onopen = () => {
        console.log('STT WebSocket connected')
        resolve()
      }
      
      this.ws.onmessage = (event) => {
        const message = event.data
        if (message.startsWith('ERROR:')) {
          this.onError?.(message.substring(6))
        } else if (message === 'CLEARED') {
          console.log('Audio buffer cleared')
        } else {
          // Transcription result
          this.onTranscription?.(message)
        }
      }
      
      this.ws.onerror = (error) => {
        console.error('STT WebSocket error:', error)
        reject(new Error('WebSocket connection failed'))
      }
      
      this.ws.onclose = (event) => {
        console.log('STT WebSocket closed:', event.code, event.reason)
        if (this.isRecording) {
          this.onError?.('Connection lost during recording')
        }
      }
    })
  }

  private setupMediaRecorder(stream: MediaStream): void {
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/wav'
    ]
    
    let mimeType = ''
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type
        break
      }
    }
    
    if (!mimeType) {
      throw new Error('No supported audio format found')
    }

    this.mediaRecorder = new MediaRecorder(stream, { mimeType })
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
        // Convert blob to array buffer and send to WebSocket
        event.data.arrayBuffer().then(buffer => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(buffer)
          }
        })
      }
    }
    
    this.mediaRecorder.onstop = () => {
      console.log('Media recorder stopped')
      stream.getTracks().forEach(track => track.stop())
    }
    
    this.mediaRecorder.onerror = (event: any) => {
      console.error('Media recorder error:', event.error)
      this.onError?.(`Recording error: ${event.error}`)
    }
  }
}
