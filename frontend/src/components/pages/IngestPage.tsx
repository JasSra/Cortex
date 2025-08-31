'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useIngestApi } from '@/services/apiClient'
import { IngestResult } from '@/types/api'
import { ArrowUpTrayIcon, FolderOpenIcon, XMarkIcon, DocumentIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import appBus from '@/lib/appBus'

interface UploadProgress {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  result?: IngestResult
  error?: string
}

const IngestPage: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const { uploadFiles, ingestFolder, createNote } = useIngestApi()

  const [results, setResults] = useState<IngestResult[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  const onFilesSelected = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    
    setError(null)
    const fileArray = Array.from(files)
    
    // Accept all files - let the backend handle validation and processing
    const validFiles = fileArray // No filtering - accept all files
    
    // Create progress tracking for each file
    const progressItems: UploadProgress[] = validFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'pending',
      progress: 0
    }))
    
    setUploadProgress(prev => [...prev, ...progressItems])
    setIsUploading(true)
    
    try {
      // Update status to uploading
      setUploadProgress(prev => prev.map(item => 
        progressItems.find(p => p.id === item.id) 
          ? { ...item, status: 'uploading', progress: 25 }
          : item
      ))
      
      const res = await uploadFiles(validFiles)
      
      // Update with results - match by array index since backend processes files in order
      setUploadProgress(prev => prev.map(item => {
        const progressItemIndex = progressItems.findIndex(p => p.id === item.id)
        if (progressItemIndex >= 0 && progressItemIndex < res.length) {
          const result = res[progressItemIndex]
          return {
            ...item,
            status: 'success',
            progress: 100,
            result,
            error: undefined
          }
        } else if (progressItems.find(p => p.id === item.id)) {
          // File was processed but no result (likely failed extraction)
          return {
            ...item,
            status: 'error',
            progress: 100,
            error: 'No content could be extracted from this file'
          }
        }
        return item
      }))
      
      setResults(prev => [...res, ...prev])
      appBus.emit('notes:updated', { source: 'ingest:files', count: res.length })
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
      
      // Mark all as error
      setUploadProgress(prev => prev.map(item => 
        progressItems.find(p => p.id === item.id) 
          ? { ...item, status: 'error', progress: 0, error: e?.message || 'Upload failed' }
          : item
      ))
    } finally {
      setIsUploading(false)
    }
  }, [uploadFiles])

  const onDrop = useCallback((ev: React.DragEvent) => {
    ev.preventDefault()
    setIsDragOver(false)
    if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
      onFilesSelected(ev.dataTransfer.files)
      ev.dataTransfer.clearData()
    }
  }, [onFilesSelected])

  const onDragOver = useCallback((ev: React.DragEvent) => {
    ev.preventDefault()
    setIsDragOver(true)
  }, [])

  const onDragLeave = useCallback((ev: React.DragEvent) => {
    ev.preventDefault()
    setIsDragOver(false)
  }, [])

  const onPaste = useCallback(async (ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = ev.clipboardData.getData('text')
    if (!text?.trim()) return
    setPasteText(prev => prev + (prev ? '\n' : '') + text)
    
    setError(null)
    setIsUploading(true)
    
    try {
  const result = await createNote(text.trim())
      setResults(prev => [result, ...prev])
  appBus.emit('notes:updated', { source: 'ingest:paste', noteId: result.noteId })
      // Clear the textarea after successful note creation
      setPasteText('')
      if (pasteRef.current) pasteRef.current.value = ''
    } catch (e: any) {
      setError(e?.message || 'Failed to create note from pasted text')
    } finally {
      setIsUploading(false)
    }
  }, [createNote])

  const onFolderIngest = useCallback(async () => {
    if (!folderPath.trim()) return
    setError(null)
    setIsUploading(true)
    try {
  const res = await ingestFolder(folderPath.trim())
      setResults(prev => [...res, ...prev])
  appBus.emit('notes:updated', { source: 'ingest:folder', count: res.length })
    } catch (e: any) {
      setError(e?.message || 'Folder ingest failed')
    } finally {
      setIsUploading(false)
    }
  }, [folderPath, ingestFolder])

  const dropzoneClasses = useMemo(() => (
    'flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 '
    + (isDragOver 
      ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500 dark:border-purple-400 scale-[1.02]' 
      : 'bg-white dark:bg-slate-800/80 border-gray-300 dark:border-slate-600 hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10')
    + ' cursor-pointer'
  ), [isDragOver])

  const clearUploadProgress = useCallback(() => {
    setUploadProgress([])
  }, [])

  const removeUploadItem = useCallback((id: string) => {
    setUploadProgress(prev => prev.filter(item => item.id !== id))
  }, [])

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }, [])

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-slate-400">Please sign in to ingest documents</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ingest Documents</h1>
          <p className="text-gray-600 dark:text-slate-400">Paste text, upload files, or ingest a local folder (if enabled)</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl hover:bg-purple-700"
          >
            <ArrowUpTrayIcon className="w-5 h-5" /> Upload Files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            aria-label="Upload files"
            className="hidden"
            onChange={e => onFilesSelected(e.target.files)}
          />
        </div>
      </div>

      {/* Enhanced Dropzone */}
      <div
        className={dropzoneClasses}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <motion.div
          animate={isDragOver ? { scale: 1.1 } : { scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <ArrowUpTrayIcon className={`w-12 h-12 mb-3 transition-colors ${isDragOver ? 'text-purple-600' : 'text-purple-500'}`} />
        </motion.div>
        <h3 className={`text-lg font-semibold mb-2 transition-colors ${isDragOver ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-slate-300'}`}>
          {isDragOver ? 'Drop files here!' : 'Drag and drop files here, or click to browse'}
        </h3>
        <p className="text-sm text-gray-500 dark:text-slate-400">All file types accepted - system will attempt to extract text content</p>
        {uploadProgress.length > 0 && (
          <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
            {uploadProgress.filter(p => p.status === 'success').length} of {uploadProgress.length} files processed
          </p>
        )}
      </div>

      {/* Upload Progress */}
      <AnimatePresence>
        {uploadProgress.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Upload Progress ({uploadProgress.filter(p => p.status === 'success').length}/{uploadProgress.length})
              </h3>
              <button
                onClick={clearUploadProgress}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1"
              >
                <XMarkIcon className="w-4 h-4" /> Clear
              </button>
            </div>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {uploadProgress.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50"
                >
                  <div className="flex-shrink-0">
                    {item.status === 'pending' && <DocumentIcon className="w-5 h-5 text-gray-400" />}
                    {item.status === 'uploading' && (
                      <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    {item.status === 'success' && <CheckCircleIcon className="w-5 h-5 text-green-500" />}
                    {item.status === 'error' && <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {item.file.name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-400">
                        {formatFileSize(item.file.size)}
                      </span>
                    </div>
                    {item.status === 'uploading' && (
                      <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-2">
                        <motion.div 
                          className="bg-purple-500 h-2 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${item.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                    {item.status === 'success' && item.result && (
                      <div className="text-xs text-green-600 dark:text-green-400">
                        Success • {item.result.chunkCount} chunks • Note ID: {item.result.noteId}
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div className="text-xs text-red-600 dark:text-red-400">
                        {item.error || 'Upload failed'}
                      </div>
                    )}
                  </div>
                  {item.status !== 'uploading' && (
                    <button
                      onClick={() => removeUploadItem(item.id)}
                      title="Remove file"
                      className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paste area */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Paste text to create a note</label>
        <textarea
          ref={pasteRef}
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          className="w-full h-28 p-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100"
          placeholder="Paste any text here..."
          onPaste={onPaste}
        />
      </div>

      {/* Optional: folder path ingest */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Local folder path</label>
            <input
              type="text"
              value={folderPath}
              onChange={e => setFolderPath(e.target.value)}
              placeholder="e.g. C:\\Users\\me\\Documents\\knowledge"
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100"
            />
          </div>
          <button
            onClick={onFolderIngest}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            <FolderOpenIcon className="w-5 h-5" /> Ingest Folder
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">Folder ingest requires server setting ALLOW_LOCAL_SCAN=true</p>
      </div>

      {/* Status */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-purple-600"
          >Uploading...</motion.div>
        )}
      </AnimatePresence>
      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent ingestions</h2>
            <button onClick={() => setResults([])} className="text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1">
              <XMarkIcon className="w-4 h-4" /> Clear
            </button>
          </div>
          <ul className="divide-y divide-gray-200 dark:divide-slate-700">
            {results.map((r, idx) => (
              <li key={`${r.noteId}-${idx}`} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{r.title || r.noteId}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">Chunks: {r.chunkCount} {r.error && <span className="text-red-500">• {r.error}</span>}</div>
                </div>
                <span className="text-xs rounded-full px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">{r.status || 'ingested'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}

export default IngestPage
