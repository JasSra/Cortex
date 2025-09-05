"use client";

import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone, faMicrophoneSlash, faCheck, faUndo } from "@fortawesome/free-solid-svg-icons";
import { useAppAuth } from "@/hooks/useAppAuth";

interface CommandDeckProps {}

export default function CommandDeck({}: CommandDeckProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [micState, setMicState] = useState<"idle" | "listening" | "processing">("idle");
  const websocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const { getAccessToken } = useAppAuth();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      // Create WebSocket connection to backend
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081";
      const wsBase = baseUrl.replace(/^http/, "ws");
      const token = await getAccessToken?.();
      const url = `${wsBase}/voice/stt${token ? `?access_token=${encodeURIComponent(token)}` : ""}`;
      const ws = new WebSocket(url);
      websocketRef.current = ws;
      
      ws.onopen = () => {
        setMicState("listening");
        setIsRecording(true);
      };
      
      ws.onmessage = (event) => {
        const handleText = (text: string) => {
          const cleaned = text?.replace(/^\s*Echo:\s*/i, "").trim();
          if (cleaned) setTranscript(prev => (prev ? prev + " " : "") + cleaned);
        };

        try {
          if (typeof event.data === "string") {
            // Try JSON first, else treat as plain text
            try {
              const data = JSON.parse(event.data);
              const msg = data?.text || data?.partial || data?.final;
              if (typeof msg === "string") handleText(msg);
              else if (data && typeof data === "object") {
                const values = Object.values(data).filter(v => typeof v === "string") as string[];
                if (values.length) handleText(values.join(" "));
              }
            } catch {
              handleText(event.data as string);
            }
          } else if (event.data instanceof Blob) {
            event.data.text().then(handleText).catch(() => {/* noop */});
          }
        } catch (error) {
          console.error("Error handling STT response:", error);
        }
      };
      
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        stopRecording();
      };
      
      // Set up MediaRecorder to send audio data
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(event.data);
        }
      };
      
      mediaRecorder.start(100); // Send data every 100ms
      
    } catch (error) {
      console.error("Error starting recording:", error);
      setMicState("idle");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    
    if (websocketRef.current) {
      try {
        if (websocketRef.current.readyState === WebSocket.OPEN) {
          websocketRef.current.send("end");
        }
      } catch {}
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    setIsRecording(false);
    setMicState("processing");
    
    // Reset to idle after processing
    setTimeout(() => setMicState("idle"), 1000);
  };

  const confirmAction = () => {
    // TODO: Implement confirm action
    console.log("Confirming action with transcript:", transcript);
    setTranscript("");
  };

  const undoAction = () => {
    setTranscript("");
    setMicState("idle");
  };

  const getMicButtonClass = () => {
    const baseClass = "w-12 h-12 rounded-full flex items-center justify-center text-white transition-all duration-200";
    
    switch (micState) {
      case "listening":
        return `${baseClass} bg-red-500 animate-pulse`;
      case "processing":
        return `${baseClass} bg-yellow-500`;
      default:
        return `${baseClass} bg-blue-500 hover:bg-blue-600`;
    }
  };

  return (
    <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Left side - Mic and controls */}
        <div className="flex items-center space-x-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={getMicButtonClass()}
            disabled={micState === "processing"}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            title={isRecording ? "Stop recording" : "Start recording"}
          >
            <FontAwesomeIcon 
              icon={isRecording ? faMicrophoneSlash : faMicrophone} 
              className="text-lg"
            />
          </button>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-600">
              {micState === "idle" && "Ready"}
              {micState === "listening" && "Listening..."}
              {micState === "processing" && "Processing..."}
            </span>
          </div>
        </div>

        {/* Center - Live transcript */}
        <div className="flex-1 mx-8">
          <div className="bg-gray-50 rounded-lg px-4 py-2 min-h-[3rem] flex items-center">
            <p className="text-gray-700 text-sm">
              {transcript || "Voice transcript will appear here..."}
            </p>
          </div>
        </div>

        {/* Right side - Action buttons */}
        <div className="flex items-center space-x-2">
          {transcript && (
            <>
              <button
                onClick={confirmAction}
                className="flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                <FontAwesomeIcon icon={faCheck} className="text-sm" />
                <span>Confirm</span>
              </button>
              
              <button
                onClick={undoAction}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                <FontAwesomeIcon icon={faUndo} className="text-sm" />
                <span>Undo</span>
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Intent chips placeholder */}
      {transcript && (
        <div className="max-w-6xl mx-auto mt-3 flex space-x-2">
          <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
            Intent: Search
          </div>
          <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">
            Confidence: High
          </div>
        </div>
      )}
    </div>
  );
}
