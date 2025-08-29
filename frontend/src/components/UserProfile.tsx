'use client'

import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { UserIcon } from '@heroicons/react/24/outline'

export function UserProfile() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <UserIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Please sign in to view your profile</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center space-x-4">
        <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
          <UserIcon className="w-8 h-8 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {user.name || user.username || 'User'}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {(user as any).email || 'No email provided'}
          </p>
        </div>
      </div>
      
      <div className="mt-6 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Member since</span>
          <span className="text-gray-900 dark:text-white">
            {(user as any).createdAt ? new Date((user as any).createdAt).toLocaleDateString() : 'Recently'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Status</span>
          <span className="text-green-600 dark:text-green-400">Active</span>
        </div>
      </div>
    </div>
  )
}