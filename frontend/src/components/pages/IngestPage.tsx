'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIngestApi, useAdvancedUrlIngestApi } from '@/services/apiClient'
import { IngestResult } from '@/types/api'
import { ArrowUpTrayIcon, FolderOpenIcon, XMarkIcon, DocumentIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import appBus from '@/lib/appBus'

interface UploadProgress { id: string; file: File; status: 'pending' | 'uploading' | 'success' | 'error'; progress: number; result?: IngestResult; error?: string }
interface UrlProgress { id: string; url: string; status: 'queued' | 'pending' | 'fetching' | 'extracting' | 'uploading' | 'success' | 'error' | 'paused' | 'canceled'; progress: number; result?: any; error?: string; title?: string; siteName?: string; retryCount?: number; maxRetries?: number; abortController?: AbortController | null }

const IngestPage: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const { uploadFiles, ingestFolder, createNote, ingestUrlContent } = useIngestApi()
  const { ingestPdfFromUrl } = useAdvancedUrlIngestApi()

  const [results, setResults] = useState<IngestResult[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  // URL ingestion state
  const [urlText, setUrlText] = useState('')
  const [urlProgress, setUrlProgress] = useState<UrlProgress[]>([])
  const [isProcessingUrls, setIsProcessingUrls] = useState(false)
  const [queueRunning, setQueueRunning] = useState(false)
  const [activeCount, setActiveCount] = useState(0)
  const queueConcurrency = 2
  const [toast, setToast] = useState<string>('')

  const inputRef = useRef<HTMLInputElement>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const urlProgressRef = useRef<UrlProgress[]>([])
  useEffect(() => { urlProgressRef.current = urlProgress }, [urlProgress])

  const formatFileSize = useCallback((size: number) => {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }, [])

  const dropzoneClasses = useMemo(() => (
    `cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ` +
    (isDragOver
      ? 'border-purple-500 bg-purple-50 dark:border-purple-400 dark:bg-purple-900/10'
      : 'border-gray-300 dark:border-slate-600')
  ), [isDragOver])

  // File selection/upload handler (defined early so drop handlers can depend on it)
  const onFilesSelected = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    const fileArray = Array.from(files)
    const validFiles = fileArray
    const progressItems: UploadProgress[] = validFiles.map(file => ({ id: crypto.randomUUID(), file, status: 'pending', progress: 0 }))
    setUploadProgress(prev => [...prev, ...progressItems])
    setIsUploading(true)

    const newResults: IngestResult[] = []
    let currentIndex = 0
    for (const progressItem of progressItems) {
      currentIndex++
      const maxRetries = 3
      let retryCount = 0
      let success = false
      while (retryCount < maxRetries && !success) {
        try {
          setUploadProgress(prev => prev.map(item => item.id === progressItem.id ? { ...item, status: 'uploading', progress: 25 + (retryCount * 20), error: retryCount ? `Retry ${retryCount}/${maxRetries}` : undefined } : item))
          const res = await uploadFiles([progressItem.file])
          if (res && res.length > 0) {
            const result = res[0] as Partial<IngestResult>
            const ingestResult: IngestResult = { noteId: (result.noteId as string) || '', title: result.title || progressItem.file.name, status: result.status || 'ingested', chunkCount: result.chunkCount ?? 0, error: result.error }
            setUploadProgress(prev => prev.map(item => item.id === progressItem.id ? { ...item, status: 'success', progress: 100, result: ingestResult, error: undefined } : item))
            newResults.push(ingestResult)
            success = true
          } else { throw new Error('No result returned from server') }
        } catch (e: any) {
          retryCount++
          if (retryCount >= maxRetries) { setUploadProgress(prev => prev.map(item => item.id === progressItem.id ? { ...item, status: 'error', progress: 100, error: `Failed after ${maxRetries} attempts: ${e?.message || 'Upload failed'}` } : item)) }
          else { await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 1000)) }
        }
      }
      if (currentIndex < progressItems.length) await new Promise(r => setTimeout(r, 200))
    }

    setResults(prev => [...newResults, ...prev])
    appBus.emit('notes:updated', { source: 'ingest:files', count: newResults.length })
    setIsUploading(false)
  }, [uploadFiles])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragOver(true) }, [])
  const onDragLeave = useCallback(() => setIsDragOver(false), [])
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragOver(false); const files = e.dataTransfer?.files; if (files) void onFilesSelected(files) }, [onFilesSelected])

  const clearUploadProgress = useCallback(() => { setUploadProgress([]) }, [])
  const removeUploadItem = useCallback((id: string) => { setUploadProgress(prev => prev.filter(p => p.id !== id)) }, [])

  const clearUrlProgress = useCallback(() => {
    setUrlProgress(prev => {
      const hasActive = prev.some(p => ['pending','fetching','extracting','uploading'].includes(p.status))
      return hasActive ? prev.filter(p => ['pending','fetching','extracting','uploading'].includes(p.status)) : []
    })
  }, [])
  const removeUrlItem = useCallback((id: string) => {
    setUrlProgress(prev => {
      const item = prev.find(p => p.id === id)
      if (!item) return prev
      if (['pending','fetching','extracting','uploading'].includes(item.status)) return prev
      return prev.filter(p => p.id !== id)
    })
  }, [])

  const extractUrlsFromText = useCallback((text: string): string[] => {
    if (!text) return []
    const hrefMatches = text.match(/href=["']([^"']+)["']/gi) || []
    const hrefUrls = hrefMatches.map(m => m.replace(/href=["']([^"']+)["']/i, '$1')).filter(u => u.startsWith('http'))
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi
    const plainUrls = text.match(urlRegex) || []
    const merged = [...hrefUrls, ...plainUrls]
    const unique = Array.from(new Set(merged))
    const valid = unique.filter(u => { try { new URL(u); return true } catch { return false } })
    return valid
  }, [])

  const onUrlPaste = useCallback((ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
    try {
      const html = ev.clipboardData.getData('text/html')
      const text = ev.clipboardData.getData('text')
      const combined = [text, html].filter(Boolean).join('\n')
      const urls = extractUrlsFromText(combined)
      if (urls.length > 0) { ev.preventDefault(); setUrlText(urls.join('\n')) }
    } catch {}
  }, [extractUrlsFromText])

  

  const enqueueUrls = useCallback((urls: string[]) => {
    const items: UrlProgress[] = urls.map(url => ({ id: crypto.randomUUID(), url, status: 'queued', progress: 0, retryCount: 0, maxRetries: 3 }))
    setUrlProgress(prev => {
      const existing = new Set(prev.map(p => p.url))
      const filtered = items.filter(i => !existing.has(i.url))
      return [...prev, ...filtered]
    })
  }, [])

  const processUrlItem = useCallback(async (id: string) => {
    setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, status: 'pending', progress: 5 } : p))
    setActiveCount(c => c + 1)
    try {
      let attempt = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const item = urlProgressRef.current.find(p => p.id === id)
        if (!item) break
        if (item.status === 'canceled') break
        if (item.status === 'paused') { await new Promise(r => setTimeout(r, 300)); continue }
        const abortController = new AbortController()
        setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, abortController } : p))
        try {
          setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, status: 'fetching', progress: 20 } : p))
          const resp = await fetch('/api/fetch-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: item.url }), signal: abortController.signal })
          if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`)
          const data = await resp.json()
          setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, status: 'extracting', progress: 45, title: data.title, siteName: data.siteName } : p))
          setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, status: 'uploading', progress: 65 } : p))
          const isPdf = /\.pdf($|\?)/i.test(item.url)
          if (isPdf) {
            const pdfRes = await ingestPdfFromUrl(item.url, data.title)
            // PDF endpoint returns only success indicator; note creation happens server-side
            const resObj = { noteId: 'pending', countChunks: 0, title: (pdfRes?.title || data?.title || item.url) }
            setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, status: 'success', progress: 100, result: resObj } : p))
            setResults(prev => [{ noteId: resObj.noteId, title: resObj.title, status: 'ingested', chunkCount: resObj.countChunks || 0 }, ...prev])
            appBus.emit('notes:updated', { source: 'ingest:urls', count: 1 })
          } else {
            const mainRes = await ingestUrlContent({
              url: item.url,
              title: data.title || undefined,
              // Ensure we send non-empty extracted content: prefer plain text, fallback to HTML
              content: (data.textContent || data.content || ''),
              finalUrl: data.finalUrl || undefined,
              siteName: data.siteName || undefined,
              byline: data.byline || undefined,
              publishedTime: data.publishedTime || undefined,
            })
            const extra = Array.isArray(data.links) ? data.links : []
            if (extra.length > 0) enqueueUrls(extra)
            setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, status: 'success', progress: 100, result: mainRes } : p))
            setResults(prev => [mainRes, ...prev])
            appBus.emit('notes:updated', { source: 'ingest:urls', count: 1 })
          }
          break
        } catch (err: any) {
          if (err?.name === 'AbortError') { setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, status: 'canceled', error: 'Canceled', abortController: null } : p)); break }
          attempt += 1
          const maxRetries = item?.maxRetries ?? 3
          if (attempt > maxRetries) { setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, status: 'error', progress: 100, error: err?.message || 'Failed' } : p)); break }
          else { setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, retryCount: attempt, error: `Retry ${attempt}/${maxRetries}: ${err?.message || 'Failed'}` } : p)); await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 8000))) }
        }
      }
    } finally { setActiveCount(c => Math.max(0, c - 1)) }
  }, [enqueueUrls, ingestPdfFromUrl, ingestUrlContent])

  const pumpQueue = useCallback(async () => {
    if (!queueRunning) return
    const active = urlProgressRef.current.filter(p => ['pending','fetching','extracting','uploading'].includes(p.status)).length
    const available = Math.max(0, queueConcurrency - active)
    if (available <= 0) return
    const next = urlProgressRef.current.filter(p => p.status === 'queued').slice(0, available)
    for (const item of next) { processUrlItem(item.id) }
  }, [queueRunning, queueConcurrency, processUrlItem])

  useEffect(() => { void pumpQueue() }, [pumpQueue])
  useEffect(() => {
    const hasActive = urlProgress.some(p => ['pending','fetching','extracting','uploading'].includes(p.status))
    const hasQueued = urlProgress.some(p => p.status === 'queued')
    setIsProcessingUrls(queueRunning || hasActive || hasQueued)
    if (queueRunning && !hasActive && !hasQueued) setQueueRunning(false)
  }, [urlProgress, queueRunning])

  // Simple toast helper (define before any usage)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }, [])

  const onUrlsProcess = useCallback(() => {
    if (!urlText.trim()) return
    const urls = urlText.trim().split(/[\n\r\s,]+/).map(u => u.trim()).filter(u => { try { new URL(u); return true } catch { return false } })
    if (urls.length === 0) { setError('No valid URLs found. Please enter valid HTTP/HTTPS URLs.'); return }
    setError(null)
    enqueueUrls(urls)
    setQueueRunning(true)
    showToast(`Queued ${urls.length} URL${urls.length === 1 ? '' : 's'}`)
  }, [urlText, enqueueUrls, showToast])

  const onFolderIngest = useCallback(async () => {
    if (!folderPath.trim()) return
    setError(null); setIsUploading(true)
    try {
      const res = await ingestFolder(folderPath.trim())
      if (res && Array.isArray(res)) {
        const added = res as IngestResult[]
        setResults(prev => [...added, ...prev])
        appBus.emit('notes:updated', { source: 'ingest:folder', count: added.length })
      }
    } catch (e: any) { setError(e?.message || 'Folder ingest failed') } finally { setIsUploading(false) }
  }, [folderPath, ingestFolder])

  const startQueue = useCallback(() => setQueueRunning(true), [])
  const pauseQueue = useCallback(() => setQueueRunning(false), [])
  const cancelItem = useCallback((id: string) => { setUrlProgress(prev => prev.map(p => { if (p.id !== id) return p; try { p.abortController?.abort() } catch {}; return { ...p, status: 'canceled', error: p.error ?? 'Canceled by user', abortController: null } })) }, [])
  const retryItem = useCallback((id: string) => { setUrlProgress(prev => prev.map(p => p.id === id ? { ...p, status: 'queued', progress: 0, error: undefined } : p)); setQueueRunning(true) }, [])
  const pauseItem = useCallback((id: string) => { setUrlProgress(prev => prev.map(p => { if (p.id !== id) return p; try { p.abortController?.abort() } catch {}; return { ...p, status: 'paused', error: undefined, abortController: null } })) }, [])

  const onPaste = useCallback(async () => {
    const text = pasteText.trim()
    if (!text) return
    setError(null); setIsUploading(true)
    try { const result = await createNote(text); setResults(prev => [result, ...prev]); appBus.emit('notes:updated', { source: 'ingest:paste', noteId: result.noteId }); setPasteText(''); if (pasteRef.current) pasteRef.current.value = ''; showToast('Note created'); }
    catch (e: any) { setError(e?.message || 'Failed to create note from pasted text') }
    finally { setIsUploading(false) }
  }, [pasteText, createNote, showToast])

  return (
    <div className="space-y-6">
      {/* Sticky status bar */}
      <div className="sticky top-0 z-10 -mx-2 px-2 py-2 bg-gradient-to-r from-purple-950/20 to-blue-900/10 backdrop-blur border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-slate-300">
          <span>Files: {uploadProgress.length} • Done {uploadProgress.filter(p => p.status==='success').length}</span>
          <span>URLs: {urlProgress.length} • Active {urlProgress.filter(p => ['pending','fetching','extracting','uploading','queued'].includes(p.status)).length}</span>
          <span>Results: {results.length}</span>
        </div>
        {toast && <div className="text-xs text-emerald-600 dark:text-emerald-300">{toast}</div>}
      </div>
      {/* Main content grid: left = files/folder, right = paste/URLs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column: files + folder */}
        <div className="space-y-6">
          {/* Dropzone */}
          <div className={dropzoneClasses} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={() => inputRef.current?.click()}>
            <motion.div animate={isDragOver ? { scale: 1.1 } : { scale: 1 }} transition={{ duration: 0.2 }}>
              <ArrowUpTrayIcon className={`w-12 h-12 mb-3 transition-colors ${isDragOver ? 'text-purple-600' : 'text-purple-500'}`} />
            </motion.div>
            <h3 className={`text-lg font-semibold mb-2 transition-colors ${isDragOver ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-slate-300'}`}>
              {isDragOver ? 'Drop files here!' : 'Drag and drop files here, or click to browse'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">All file types accepted - system will attempt to extract text content</p>
            {uploadProgress.length > 0 && (<p className="text-xs text-purple-600 dark:text-purple-400 mt-2">{uploadProgress.filter(p => p.status === 'success').length} of {uploadProgress.length} files processed</p>)}
          </div>
          <div className="mt-3">
            <button className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl hover:bg-purple-700" onClick={() => inputRef.current?.click()}>
              <ArrowUpTrayIcon className="w-5 h-5" /> Upload Files
            </button>
            <input ref={inputRef} type="file" multiple aria-label="Upload files" className="hidden" onChange={e => onFilesSelected(e.target.files)} />
          </div>

          {/* Upload Progress */}
          <AnimatePresence>
            {uploadProgress.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Upload Progress ({uploadProgress.filter(p => p.status === 'success').length}/{uploadProgress.length})</h3>
                  <button onClick={clearUploadProgress} className="text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1"><XMarkIcon className="w-4 h-4" /> Clear</button>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {uploadProgress.map((item) => (
                    <motion.div key={item.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50">
                      <div className="flex-shrink-0">
                        {item.status === 'pending' && <DocumentIcon className="w-5 h-5 text-gray-400" />}
                        {item.status === 'uploading' && (<div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />)}
                        {item.status === 'success' && <CheckCircleIcon className="w-5 h-5 text-green-500" />}
                        {item.status === 'error' && <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.file.name}</span>
                          <span className="text-xs text-gray-500 dark:text-slate-400">{formatFileSize(item.file.size)}</span>
                        </div>
                        {item.status === 'uploading' && (<div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-2"><motion.div className="bg-purple-500 h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${item.progress}%` }} transition={{ duration: 0.3 }} /></div>)}
                        {item.status === 'success' && item.result && (<div className="text-xs text-green-600 dark:text-green-400">Success • {item.result.chunkCount} chunks • Note ID: {item.result.noteId}</div>)}
                        {item.status === 'error' && (<div className="text-xs text-red-600 dark:text-red-400">{item.error || 'Upload failed'}</div>)}
                      </div>
                      {item.status !== 'uploading' && (<button onClick={() => removeUploadItem(item.id)} title="Remove file" className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"><XMarkIcon className="w-4 h-4" /></button>)}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Optional: folder path ingest */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Local folder path</label>
                <input type="text" value={folderPath} onChange={e => setFolderPath(e.target.value)} placeholder="e.g. C:\\Users\\me\\Documents\\knowledge" className="w-full p-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100" />
              </div>
              <button onClick={onFolderIngest} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700">
                <FolderOpenIcon className="w-5 h-5" /> Ingest Folder
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">Folder ingest requires server setting ALLOW_LOCAL_SCAN=true</p>
          </div>
        </div>

        {/* Right column: paste + URLs */}
        <div className="space-y-6">
          {/* Paste area */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Paste text to create a note</label>
            <textarea
              ref={pasteRef}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && pasteText.trim()) { e.preventDefault(); onPaste() } }}
              className="w-full h-28 p-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100"
              placeholder="Paste any text here... (Cmd/Ctrl+Enter to create)"
            />
            <div className="mt-2 flex justify-end">
              <button onClick={onPaste} disabled={!pasteText.trim()} className="px-3 py-1 rounded-lg bg-purple-600 text-white disabled:bg-gray-400">Create note</button>
            </div>
          </div>

          {/* URL ingestion area */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Paste URLs to extract and create notes</label>
                <textarea
                  value={urlText}
                  onChange={e => setUrlText(e.target.value)}
                  onPaste={onUrlPaste}
                  onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && urlText.trim()) { e.preventDefault(); onUrlsProcess() } }}
                  className="w-full h-20 p-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100 resize-none"
                  placeholder={`Paste URLs here (one per line)\nhttps://example.com/article1\nhttps://example.com/article2  (Cmd/Ctrl+Enter to extract)`}
                  disabled={isProcessingUrls}
                />
                {!!urlText.trim() && (<div className="mt-1 text-xs text-gray-500 dark:text-slate-400">{urlText.split(/\n/).filter(l => l.trim()).length} URL(s)</div>)}
              </div>
              <button onClick={onUrlsProcess} disabled={!urlText.trim()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
                <ArrowUpTrayIcon className="w-5 h-5" /> Extract URLs
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 -mt-2">Supports web articles, blog posts, and other HTML content. All URLs will be queued with progress.</p>
          </div>

          {/* URL Progress */}
          <AnimatePresence>
            {urlProgress.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">URL Progress ({urlProgress.filter(p => p.status === 'success').length}/{urlProgress.length})</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-slate-400 mr-2">Active: {activeCount}</span>
                    {queueRunning ? (
                      <button onClick={pauseQueue} className="text-sm px-2 py-1 rounded-lg border dark:border-slate-600">Pause</button>
                    ) : (
                      <button onClick={startQueue} className="text-sm px-2 py-1 rounded-lg border dark:border-slate-600">Start</button>
                    )}
                    <button onClick={clearUrlProgress} className="text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1">
                      <XMarkIcon className="w-4 h-4" /> Clear
                    </button>
                  </div>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {urlProgress.map((item) => (
                    <motion.div key={item.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50">
                      <div className="flex-shrink-0">
                        {item.status === 'queued' && <DocumentIcon className="w-5 h-5 text-gray-400" />}
                        {item.status === 'pending' && <DocumentIcon className="w-5 h-5 text-gray-400" />}
                        {item.status === 'fetching' && (<div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />)}
                        {item.status === 'extracting' && (<div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />)}
                        {item.status === 'uploading' && (<div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />)}
                        {item.status === 'success' && <CheckCircleIcon className="w-5 h-5 text-green-500" />}
                        {item.status === 'error' && <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.title || new URL(item.url).hostname}</span>
                          <span className="text-xs text-gray-500 dark:text-slate-400">{item.siteName || new URL(item.url).hostname}</span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 mb-1 truncate">{item.url}</div>
                        {(item.status === 'fetching' || item.status === 'extracting' || item.status === 'uploading' || item.status === 'pending' || item.status === 'queued') && (
                          <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-2">
                            <motion.div className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" initial={{ width: 0 }} animate={{ width: `${item.progress}%` }} transition={{ duration: 0.3 }} />
                          </div>
                        )}
                        {item.status === 'success' && item.result && (<div className="text-xs text-green-600 dark:text-green-400">Success • {(item.result.countChunks || item.result.chunkCount || 0)} chunks • Note ID: {item.result.noteId}</div>)}
                        {item.status === 'error' && (<div className="text-xs text-red-600 dark:text-red-400">{item.error || 'Processing failed'}</div>)}
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {['pending','fetching','extracting','uploading'].includes(item.status) && (<><button onClick={() => pauseItem(item.id)} className="text-xs px-2 py-1 rounded-lg border dark:border-slate-600">Pause</button><button onClick={() => cancelItem(item.id)} className="text-xs px-2 py-1 rounded-lg border dark:border-slate-600">Cancel</button></>)}
                        {item.status === 'paused' && (<><button onClick={() => retryItem(item.id)} className="text-xs px-2 py-1 rounded-lg border dark:border-slate-600">Resume</button><button onClick={() => cancelItem(item.id)} className="text-xs px-2 py-1 rounded-lg border dark:border-slate-600">Cancel</button></>)}
                        {item.status === 'error' && (<button onClick={() => retryItem(item.id)} className="text-xs px-2 py-1 rounded-lg border dark:border-slate-600">Retry</button>)}
                        {['success','error','canceled','paused','queued'].includes(item.status) && (<button onClick={() => removeUrlItem(item.id)} title="Remove URL" className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"><XMarkIcon className="w-4 h-4" /></button>)}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Status */}
      <AnimatePresence>
        {isUploading && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-purple-600">Uploading...</motion.div>)}
      </AnimatePresence>
      {error && (<div className="text-sm text-red-600">{error}</div>)}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent ingestions</h2>
            <button onClick={() => setResults([])} className="text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1"><XMarkIcon className="w-4 h-4" /> Clear</button>
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
