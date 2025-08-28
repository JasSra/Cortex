'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { 
  HomeIcon, 
  ChatBubbleLeftRightIcon, 
  MagnifyingGlassIcon, 
  DocumentTextIcon,
  ShareIcon,
  CogIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon,
  UserCircleIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

interface ModernLayoutProps {
  children: React.ReactNode
  activeView: string
  onViewChange: (view: string) => void
  sidebarOpen: boolean
  onSidebarToggle: () => void
}

const navigation = [
  { name: 'Dashboard', href: 'dashboard', icon: HomeIcon, current: true },
  { name: 'Analytics', href: 'analytics', icon: ChartBarIcon, current: false },
  { name: 'Chat Assistant', href: 'chat', icon: ChatBubbleLeftRightIcon, current: false },
  { name: 'Search', href: 'search', icon: MagnifyingGlassIcon, current: false },
  { name: 'Documents', href: 'documents', icon: DocumentTextIcon, current: false },
  { name: 'Knowledge Graph', href: 'graph', icon: ShareIcon, current: false },
  { name: 'Settings', href: 'settings', icon: CogIcon, current: false },
]

export default function ModernLayout({ 
  children, 
  activeView, 
  onViewChange, 
  sidebarOpen, 
  onSidebarToggle 
}: ModernLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-gray-900/80 lg:hidden"
          onClick={onSidebarToggle}
        />
      )}

      {/* Sidebar */}
      <motion.div
        initial={{ x: sidebarOpen ? 0 : -320 }}
        animate={{ x: sidebarOpen ? 0 : -320 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`fixed inset-y-0 z-50 flex w-80 flex-col bg-white/80 backdrop-blur-xl border-r border-gray-200/50 shadow-xl lg:translate-x-0`}
      >
        {/* Sidebar header */}
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-gray-200/50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Cortex
            </span>
          </div>
          <button
            onClick={onSidebarToggle}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navigation.map((item) => (
            <motion.button
              key={item.name}
              onClick={() => onViewChange(item.href)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                activeView === item.href
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25'
                  : 'text-gray-700 hover:bg-white/70 hover:text-gray-900 hover:shadow-sm'
              }`}
            >
              <item.icon 
                className={`h-5 w-5 ${
                  activeView === item.href ? 'text-white' : 'text-gray-400'
                }`} 
              />
              <span>{item.name}</span>
            </motion.button>
          ))}
        </nav>

        {/* User profile */}
        <div className="p-4 border-t border-gray-200/50">
          <div className="flex items-center space-x-3 p-3 rounded-xl bg-gray-50/70 hover:bg-white/70 transition-colors cursor-pointer">
            <UserCircleIcon className="h-8 w-8 text-gray-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                User
              </p>
              <p className="text-xs text-gray-500 truncate">
                Administrator
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main content */}
      <div className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-80' : 'lg:ml-0'}`}>
        {/* Top bar */}
        <motion.header 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between bg-white/80 backdrop-blur-xl border-b border-gray-200/50 px-6 shadow-sm"
        >
          <div className="flex items-center space-x-4">
            <button
              onClick={onSidebarToggle}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors lg:hidden"
            >
              <Bars3Icon className="h-5 w-5" />
            </button>
            
            <div className="hidden lg:block">
              <h1 className="text-xl font-semibold text-gray-900 capitalize">
                {activeView.replace('-', ' ')}
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Search bar */}
            <div className="hidden md:block">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search everything..."
                  className="w-64 pl-10 pr-4 py-2 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Notifications */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <BellIcon className="h-5 w-5 text-gray-600" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
            </motion.button>

            {/* Profile */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-1 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <UserCircleIcon className="h-8 w-8 text-gray-600" />
            </motion.button>
          </div>
        </motion.header>

        {/* Page content */}
        <main className="flex-1 p-6">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
