'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { 
  WifiIcon, 
  ExclamationTriangleIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { useConnectivity } from '@/contexts/ConnectivityContext'

interface ConnectivityIndicatorProps {
  className?: string
  showDetails?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function ConnectivityIndicator({ 
  className = '', 
  showDetails = false,
  size = 'sm'
}: ConnectivityIndicatorProps) {
  const { status, isMonitoring, manualCheck } = useConnectivity()

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  }

  const iconSize = sizeClasses[size]

  const getStatusColor = () => {
    if (!isMonitoring) return 'text-gray-400'
    return status.isOnline ? 'text-emerald-500' : 'text-red-500'
  }

  const getStatusIcon = () => {
    if (!isMonitoring) {
      return <ClockIcon className={iconSize} />
    }
    
    return status.isOnline ? (
      <WifiIcon className={iconSize} />
    ) : (
      <ExclamationTriangleIcon className={iconSize} />
    )
  }

  const getStatusText = () => {
    if (!isMonitoring) return 'Monitoring paused'
    if (status.isOnline) {
      if (status.responseTime) {
        return `Online (${status.responseTime}ms)`
      }
      return 'Online'
    }
    return 'Offline'
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <motion.div
        animate={status.isOnline ? {} : { scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        className={`${getStatusColor()}`}
        title={showDetails ? undefined : getStatusText()}
        onClick={manualCheck}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            manualCheck()
          }
        }}
      >
        {getStatusIcon()}
      </motion.div>
      
      {showDetails && (
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          {status.lastCheck && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(status.lastCheck).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
