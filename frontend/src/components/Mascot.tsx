'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  MicrophoneIcon, 
  SparklesIcon, 
  LightBulbIcon,
  HeartIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

export type MascotState = 
  | 'idle' 
  | 'listening' 
  | 'thinking' 
  | 'responding' 
  | 'suggesting' 
  | 'celebrating' 
  | 'sleeping'
  | 'error'

interface MascotProps {
  state?: MascotState
  message?: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  size?: 'small' | 'medium' | 'large'
  onInteraction?: () => void
  className?: string
}

const Mascot: React.FC<MascotProps> = ({
  state = 'idle',
  message,
  position = 'bottom-right',
  size = 'medium',
  onInteraction,
  className = ''
}) => {
  const [currentMessage, setCurrentMessage] = useState(message)
  const [showMessage, setShowMessage] = useState(false)
  const [eyeDirection, setEyeDirection] = useState({ x: 0, y: 0 })

  // Auto-hide message after 3 seconds
  useEffect(() => {
    if (message) {
      setCurrentMessage(message)
      setShowMessage(true)
      const timer = setTimeout(() => setShowMessage(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [message])

  // Simulate eye movement for idle state
  useEffect(() => {
    let interval: NodeJS.Timeout
    
    if (state === 'idle') {
      interval = setInterval(() => {
        setEyeDirection({
          x: (Math.random() - 0.5) * 10,
          y: (Math.random() - 0.5) * 8
        })
      }, 2000 + Math.random() * 3000)
    }
    
    return () => clearInterval(interval)
  }, [state])

  const getSizeClasses = () => {
    switch (size) {
      case 'small': return 'w-16 h-16'
      case 'medium': return 'w-20 h-20'
      case 'large': return 'w-24 h-24'
      default: return 'w-20 h-20'
    }
  }

  const getPositionClasses = () => {
    switch (position) {
      case 'bottom-right': return 'fixed bottom-6 right-6'
      case 'bottom-left': return 'fixed bottom-6 left-6'
      case 'top-right': return 'fixed top-20 right-6'
      case 'top-left': return 'fixed top-20 left-6'
      default: return 'fixed bottom-6 right-6'
    }
  }

  const getMascotAnimations = () => {
    const baseAnimation = {
      scale: [1, 1.05, 1],
      transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
    }

    switch (state) {
      case 'listening':
        return {
          scale: [1, 1.1, 1],
          rotate: [0, -5, 5, 0],
          transition: { duration: 0.8, repeat: Infinity }
        }
      case 'thinking':
        return {
          rotate: [0, 10, -10, 0],
          transition: { duration: 1.5, repeat: Infinity }
        }
      case 'responding':
        return {
          y: [0, -8, 0],
          transition: { duration: 0.6, repeat: Infinity }
        }
      case 'suggesting':
        return {
          scale: [1, 1.15, 1],
          transition: { duration: 0.5, repeat: Infinity }
        }
      case 'celebrating':
        return {
          scale: [1, 1.2, 1],
          rotate: [0, 360],
          transition: { duration: 1, repeat: 2 }
        }
      case 'sleeping':
        return {
          scale: [1, 0.95, 1],
          transition: { duration: 3, repeat: Infinity }
        }
      case 'error':
        return {
          x: [-5, 5, -5, 5, 0],
          transition: { duration: 0.5, repeat: 1 }
        }
      default:
        return baseAnimation
    }
  }

  const getMascotColor = () => {
    switch (state) {
      case 'listening': return 'from-blue-400 to-blue-600'
      case 'thinking': return 'from-purple-400 to-purple-600'
      case 'responding': return 'from-green-400 to-green-600'
      case 'suggesting': return 'from-yellow-400 to-orange-500'
      case 'celebrating': return 'from-pink-400 to-purple-600'
      case 'sleeping': return 'from-gray-300 to-gray-500'
      case 'error': return 'from-red-400 to-red-600'
      default: return 'from-indigo-400 to-purple-600'
    }
  }

  const getStateIcon = () => {
    switch (state) {
      case 'listening': return <MicrophoneIcon className="w-3 h-3 text-white" />
      case 'thinking': return <SparklesIcon className="w-3 h-3 text-white animate-spin" />
      case 'suggesting': return <LightBulbIcon className="w-3 h-3 text-white" />
      case 'celebrating': return <HeartIcon className="w-3 h-3 text-white" />
      case 'error': return <ExclamationTriangleIcon className="w-3 h-3 text-white" />
      default: return null
    }
  }

  return (
    <div className={`${getPositionClasses()} z-50 ${className}`}>
      {/* Message Bubble */}
      <AnimatePresence>
        {showMessage && currentMessage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="absolute bottom-full mb-3 right-0 max-w-xs"
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 relative">
              <p className="text-sm text-gray-700 dark:text-gray-300">{currentMessage}</p>
              {/* Speech bubble arrow */}
              <div className="absolute top-full right-4 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white dark:border-t-gray-800"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mascot Body */}
      <motion.div
        className={`${getSizeClasses()} relative cursor-pointer`}
        animate={getMascotAnimations()}
        onClick={onInteraction}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Main mascot circle */}
        <div className={`w-full h-full rounded-full bg-gradient-to-br ${getMascotColor()} shadow-lg relative overflow-hidden`}>
          {/* Eyes */}
          <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 flex space-x-2">
            <motion.div 
              className="w-2 h-2 bg-white rounded-full relative"
              animate={{ x: eyeDirection.x * 0.3, y: eyeDirection.y * 0.3 }}
            >
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-gray-800 rounded-full"></div>
            </motion.div>
            <motion.div 
              className="w-2 h-2 bg-white rounded-full relative"
              animate={{ x: eyeDirection.x * 0.3, y: eyeDirection.y * 0.3 }}
            >
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-gray-800 rounded-full"></div>
            </motion.div>
          </div>

          {/* Mouth */}
          <motion.div 
            className="absolute bottom-1/3 left-1/2 transform -translate-x-1/2"
            animate={state === 'responding' ? { 
              scaleY: [1, 1.5, 1],
              transition: { duration: 0.3, repeat: Infinity } 
            } : {}}
          >
            {state === 'sleeping' ? (
              <div className="w-4 h-1 bg-gray-700 rounded-full"></div>
            ) : (
              <div className="w-3 h-2 border-2 border-gray-700 rounded-full border-t-transparent"></div>
            )}
          </motion.div>

          {/* State indicator */}
          {getStateIcon() && (
            <motion.div 
              className="absolute -top-1 -right-1 w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              {getStateIcon()}
            </motion.div>
          )}

          {/* Particle effects for certain states */}
          {(state === 'celebrating' || state === 'suggesting') && (
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-yellow-300 rounded-full"
                  style={{
                    left: `${20 + i * 10}%`,
                    top: `${20 + (i % 2) * 30}%`,
                  }}
                  animate={{
                    y: [-10, -20, -10],
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pulsing ring for listening state */}
        {state === 'listening' && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-blue-400"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.7, 0, 0.7],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
            }}
          />
        )}
      </motion.div>
    </div>
  )
}

export default Mascot
