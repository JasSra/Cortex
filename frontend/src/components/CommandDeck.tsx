"use client";

import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone, faMicrophoneSlash, faCheck, faUndo } from "@fortawesome/free-solid-svg-icons";

interface CommandDeckProps {}

export default function CommandDeck({}: CommandDeckProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [micState, setMicState] = useState<"idle" | "listening" | "processing">("idle");
  const websocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create WebSocket connection to backend
      const ws = new WebSocket(`ws://localhost:8080/voice/stt`);
      websocketRef.current = ws;
      
      ws.onopen = () => {
        setMicState("listening");
        setIsRecording(true);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.text) {
            setTranscript(prev => prev + " " + data.text);
          }
        } catch (error) {
          console.error("Error parsing STT response:", error);
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
    
    if (websocketRef.current) {
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
