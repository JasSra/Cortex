'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useIngestApi, useNotesApi } from '@/services/apiClient'
import { IngestResult, Note } from '@/types/api'
import { ArrowUpTrayIcon, FolderOpenIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'

const IngestPage: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const { uploadFiles, ingestFolder } = useIngestApi()
  const { getNotes } = useNotesApi()

  const [results, setResults] = useState<IngestResult[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  const onFilesSelected = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    setIsUploading(true)
    try {
      const res = await uploadFiles(files)
      setResults(prev => [...res, ...prev])
      const latest = await getNotes()
      setNotes(latest as any)
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }, [uploadFiles, getNotes])

  const onDrop = useCallback((ev: React.DragEvent) => {
    ev.preventDefault()
    if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
      onFilesSelected(ev.dataTransfer.files)
      ev.dataTransfer.clearData()
    }
  }, [onFilesSelected])

  const onPaste = useCallback(async (ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = ev.clipboardData.getData('text')
    if (!text?.trim()) return
    // Convert pasted text into a temporary txt file for upload
    const file = new File([text], `pasted-${Date.now()}.txt`, { type: 'text/plain' })
    const list: any = [file]
    await onFilesSelected({ 0: file, length: 1, item: (i: number) => list[i] } as unknown as FileList)
  }, [onFilesSelected])

  const onFolderIngest = useCallback(async () => {
    if (!folderPath.trim()) return
    setError(null)
    setIsUploading(true)
    try {
      const res = await ingestFolder(folderPath.trim())
      setResults(prev => [...res, ...prev])
      const latest = await getNotes()
      setNotes(latest as any)
    } catch (e: any) {
      setError(e?.message || 'Folder ingest failed')
    } finally {
      setIsUploading(false)
    }
  }, [folderPath, ingestFolder, getNotes])

  const dropzoneClasses = useMemo(() => (
    'flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 text-center '
    + 'bg-white dark:bg-slate-800/80 border-gray-300 dark:border-slate-600 hover:border-purple-500 '
    + 'transition-colors cursor-pointer'
  ), [])

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
            accept=".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
        </div>
      </div>

      {/* Dropzone */}
      <div
        className={dropzoneClasses}
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <ArrowUpTrayIcon className="w-10 h-10 text-purple-600 mb-2" />
        <p className="text-gray-700 dark:text-slate-300">Drag and drop files here, or click to browse</p>
        <p className="text-sm text-gray-500 dark:text-slate-400">Supported: .txt, .md, .pdf, .docx</p>
      </div>

      {/* Paste area */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Paste text to create a note</label>
        <textarea
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

      {/* Notes preview */}
      {notes.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Your notes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {notes.slice(0, 6).map(n => (
              <div key={n.id} className="p-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700">
                <div className="font-medium text-gray-900 dark:text-white">{n.title || n.id}</div>
                <div className="text-sm text-gray-600 dark:text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default IngestPage
