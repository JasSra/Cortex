"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useCortexApiClient } from '@/services/apiClient'
import { PaperClipIcon, ArrowDownTrayIcon, TrashIcon, ArrowPathIcon, PlusIcon, TagIcon } from '@heroicons/react/24/outline'

type StoredFile = {
  id: string
  fileName: string
  url: string
  sizeBytes: number
  contentType: string
  extension: string
  tags: string[]
}

export default function DocumentsPage() {
  const client = useCortexApiClient()
  const [items, setItems] = useState<StoredFile[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string|undefined>()
  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const page = Math.floor(offset / limit) + 1
  const pageCount = Math.max(1, Math.ceil(total / limit))

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const res = await client.storageGET(limit, offset)
      setItems((res.items as any) || [])
      setTotal((res.total as any) ?? 0)
    } catch (e: any) {
      setError(e?.message || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [client, limit, offset])

  useEffect(() => { void load() }, [load])

  const onDelete = async (id: string) => {
    if (!confirm('Delete this file?')) return
    try {
      await client.storageDELETE(id)
      // optimistic update
      setItems(prev => prev.filter(f => f.id !== id))
      setTotal(t => Math.max(0, t - 1))
    } catch (e) {
      console.error(e)
      alert('Delete failed')
    }
  }

  const onDownload = (url: string, name: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const onUploadClick = () => fileInputRef.current?.click()
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    setError(undefined)
    try {
      const payload = Array.from(files).map(f => ({ data: f, fileName: f.name })) as any
      const res = await client.upload(payload)
      const newFiles = (res.files as any as StoredFile[])
      setItems(prev => [...newFiles, ...prev])
      setTotal(t => t + newFiles.length)
      e.target.value = ''
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const prettySize = (n: number) => {
    const units = ['B','KB','MB','GB']
    let i = 0
    let v = n
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
    return `${v.toFixed( i === 0 ? 0 : 1)} ${units[i]}`
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Documents</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">Store and manage your files. Files are served from /storage and private to your account.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700">
            <ArrowPathIcon className="w-5 h-5 mr-1" /> Refresh
          </button>
          <button onClick={onUploadClick} className="inline-flex items-center px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500">
            <PlusIcon className="w-5 h-5 mr-1" /> Upload
          </button>
          <input
            ref={fileInputRef}
            id="documents-upload-input"
            type="file"
            multiple
            className="hidden"
            onChange={onFileChange}
            aria-label="Upload files"
            title="Upload files"
          />
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-slate-500">No documents yet. Click Upload to add files.</div>
        ) : (
          <ul role="list" className="divide-y divide-slate-200 dark:divide-slate-800">
            {items.map((f) => (
              <li key={f.id} className="py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <PaperClipIcon className="w-6 h-6 text-slate-400" />
                  <div className="min-w-0">
                    <div className="text-slate-900 dark:text-slate-100 truncate">{f.fileName}</div>
                    <div className="text-xs text-slate-500">
                      {prettySize(f.sizeBytes)} • {f.contentType || f.extension}
                    </div>
                    {f.tags?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {f.tags.map((t, i) => (
                          <span key={i} className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                            <TagIcon className="w-3 h-3 mr-1" />{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => onDownload(f.url, f.fileName)} title="Download" className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
                    <ArrowDownTrayIcon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                  </button>
                  <a href={f.url} target="_blank" rel="noopener" className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-slate-600 dark:text-slate-300">Open</a>
                  <button onClick={() => onDelete(f.id)} title="Delete" className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30">
                    <TrashIcon className="w-5 h-5 text-red-600" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm">
        <div className="text-slate-600 dark:text-slate-400">{total} files</div>
        <div className="flex items-center gap-2">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-50">Prev</button>
          <span className="text-slate-600 dark:text-slate-400">Page {page} / {pageCount}</span>
          <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-50">Next</button>
          <select
            value={limit}
            onChange={(e) => { setOffset(0); setLimit(parseInt(e.target.value, 10)) }}
            className="ml-2 bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
            aria-label="Rows per page"
            title="Rows per page"
          >
            {[10,25,50,100].map(n => <option key={n} value={n}>{n}/page</option>)}
          </select>
        </div>
      </div>

      {uploading && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 rounded-lg px-6 py-4 shadow-lg border border-slate-200 dark:border-slate-800">
            Uploading…
          </div>
        </div>
      )}
    </div>
  )
}
