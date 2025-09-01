'use client'

import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useState } from 'react'

export function LoginPage() {
  const { login, loading } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async () => {
    setIsLoading(true)
    try {
      await login()
    } catch (error) {
      console.error('Login failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black overflow-hidden relative flex items-center justify-center px-4">
      {/* Tron Grid Background */}
      <div className="absolute inset-0">
        {/* Main grid pattern using CSS-only approach */}
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(0,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.3)_1px,transparent_1px)] bg-[length:50px_50px]" />
        
        {/* Animated scanning lines */}
        <div className="absolute inset-0">
          {/* Horizontal scanning line */}
          <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent top-[30%] shadow-[0_0_20px_rgba(0,255,255,0.8)] animate-pulse" />
          
          {/* Vertical scanning line */}
          <div className="absolute h-full w-0.5 bg-gradient-to-b from-transparent via-orange-400 to-transparent left-[70%] shadow-[0_0_20px_rgba(255,165,0,0.8)] animate-pulse delay-1000" />
        </div>

        {/* Geometric shapes */}
        <div className="absolute top-20 left-20">
          <div className="w-32 h-32 border-2 border-cyan-400/30 rotate-45 animate-spin duration-[20s]">
            <div className="absolute inset-4 border border-cyan-400/20 animate-pulse" />
          </div>
        </div>
        
        <div className="absolute bottom-20 right-20">
          <div className="w-24 h-24 border-2 border-orange-400/30 rotate-12 animate-pulse">
            <div className="absolute inset-2 border border-orange-400/20" />
            <div className="absolute inset-4 border border-orange-400/10" />
          </div>
        </div>

        {/* Circuit patterns */}
        <div className="absolute top-1/4 right-1/4">
          <svg width="100" height="100" className="text-cyan-400/20 animate-pulse">
            <rect x="10" y="10" width="80" height="2" fill="currentColor" />
            <rect x="10" y="10" width="2" height="30" fill="currentColor" />
            <rect x="10" y="40" width="40" height="2" fill="currentColor" />
            <rect x="50" y="40" width="2" height="20" fill="currentColor" />
            <rect x="50" y="60" width="30" height="2" fill="currentColor" />
            <circle cx="15" cy="15" r="3" fill="currentColor" />
            <circle cx="55" cy="45" r="3" fill="currentColor" />
            <circle cx="85" cy="65" r="3" fill="currentColor" />
          </svg>
        </div>

        {/* Floating particles */}
        <div className="absolute inset-0">
          <div className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping duration-[3s] left-[20%] top-[30%]" />
          <div className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping duration-[3s] left-[30%] top-[35%] delay-500" />
          <div className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping duration-[3s] left-[40%] top-[40%] delay-1000" />
          <div className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping duration-[3s] left-[50%] top-[45%] delay-1500" />
          <div className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping duration-[3s] left-[60%] top-[50%] delay-2000" />
          <div className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping duration-[3s] left-[70%] top-[55%] delay-2500" />
          <div className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping duration-[3s] left-[80%] top-[60%] delay-3000" />
          <div className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping duration-[3s] left-[90%] top-[65%] delay-3500" />
        </div>
      </div>

      {/* Theme Toggle - Tron Style */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-3 rounded-lg bg-black/50 backdrop-blur-sm border-2 border-cyan-400/50 hover:border-cyan-400 hover:bg-cyan-400/10 transition-all duration-300 group shadow-[0_0_15px_rgba(0,255,255,0.3)]"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <svg className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-orange-400 group-hover:text-orange-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        )}
      </button>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo/Header - Tron Style */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6 rounded-lg bg-black border-2 border-cyan-400 shadow-[0_0_30px_rgba(0,255,255,0.5)] relative overflow-hidden">
            {/* Inner glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/20 to-transparent" />
            
            {/* Circuit pattern in logo */}
            <svg className="absolute inset-2 text-cyan-400/30" fill="currentColor" viewBox="0 0 60 60">
              <rect x="5" y="28" width="50" height="1" />
              <rect x="28" y="5" width="1" height="50" />
              <rect x="15" y="15" width="10" height="1" />
              <rect x="35" y="35" width="10" height="1" />
              <circle cx="15" cy="28" r="2" />
              <circle cx="45" cy="28" r="2" />
              <circle cx="28" cy="15" r="2" />
              <circle cx="28" cy="45" r="2" />
            </svg>
            
            {/* Main icon */}
            <svg className="w-8 h-8 text-cyan-400 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-orange-400 mb-2 tracking-wider font-mono">
            CORTEX
          </h1>
          <p className="text-lg text-cyan-300 font-medium tracking-wide">Neural Knowledge Interface</p>
          <div className="mt-2 h-0.5 w-32 mx-auto bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
        </div>

        {/* Login Card - Tron Style */}
        <div className="bg-black/80 backdrop-blur-xl border-2 border-cyan-400/50 rounded-lg p-8 shadow-[0_0_40px_rgba(0,255,255,0.3)] relative overflow-hidden">
          {/* Inner glow effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 via-transparent to-orange-400/5" />
          
          {/* Corner circuit elements */}
          <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-cyan-400/60" />
          <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-cyan-400/60" />
          <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-orange-400/60" />
          <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-orange-400/60" />
          
          <div className="relative z-10">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-cyan-400 mb-2 font-mono tracking-wider">ACCESS TERMINAL</h2>
              <div className="h-px w-20 mx-auto bg-gradient-to-r from-transparent via-cyan-400 to-transparent mb-4" />
              <p className="text-cyan-300/80">Authenticate with Microsoft Neural Network</p>
            </div>

            {/* Login Button - Tron Style */}
            <button
              onClick={handleLogin}
              disabled={loading || isLoading}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-cyan-600 via-cyan-500 to-orange-500 hover:from-cyan-500 hover:via-cyan-400 hover:to-orange-400 disabled:from-gray-600 disabled:to-gray-700 text-black font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-[1.02] shadow-[0_0_25px_rgba(0,255,255,0.4)] hover:shadow-[0_0_35px_rgba(0,255,255,0.6)] disabled:hover:scale-100 disabled:hover:shadow-none focus:outline-none focus:ring-4 focus:ring-cyan-500/50 border-2 border-cyan-400/50 hover:border-cyan-400"
            >
              {/* Button circuit lines */}
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-1 left-4 right-4 h-px bg-black/40" />
                <div className="absolute bottom-1 left-4 right-4 h-px bg-black/40" />
                <div className="absolute left-1 top-4 bottom-4 w-px bg-black/40" />
                <div className="absolute right-1 top-4 bottom-4 w-px bg-black/40" />
              </div>
              
              <div className="relative flex items-center justify-center space-x-3">
                {(loading || isLoading) ? (
                  <>
                    <svg className="animate-spin w-5 h-5 text-black" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="font-mono tracking-wider">CONNECTING...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
                    </svg>
                    <span className="font-mono tracking-wider">INITIATE CONNECTION</span>
                  </>
                )}
              </div>
            </button>

            {/* System Features - Tron Style */}
            <div className="mt-8 pt-6 border-t border-cyan-400/30">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2 text-cyan-300">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,0,0.6)]" />
                  <span className="font-mono text-xs">SECURE AUTH</span>
                </div>
                <div className="flex items-center space-x-2 text-cyan-300">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse delay-75 shadow-[0_0_8px_rgba(0,255,0,0.6)]" />
                  <span className="font-mono text-xs">DATA SECURE</span>
                </div>
                <div className="flex items-center space-x-2 text-cyan-300">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse delay-150 shadow-[0_0_8px_rgba(0,255,0,0.6)]" />
                  <span className="font-mono text-xs">AI POWERED</span>
                </div>
                <div className="flex items-center space-x-2 text-cyan-300">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse delay-300 shadow-[0_0_8px_rgba(0,255,0,0.6)]" />
                  <span className="font-mono text-xs">NEURAL NET</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Tron Style */}
        <div className="text-center mt-8">
          <div className="inline-flex items-center space-x-2 text-xs text-cyan-400/60 font-mono">
            <div className="w-2 h-px bg-cyan-400/40" />
            <span>NEURAL AUTHENTICATION PROTOCOL</span>
            <div className="w-2 h-px bg-cyan-400/40" />
          </div>
          <p className="text-xs text-cyan-300/50 mt-2 font-mono">
            By accessing this terminal, you agree to neural data processing protocols.
          </p>
        </div>
      </div>
    </div>
  )
}
