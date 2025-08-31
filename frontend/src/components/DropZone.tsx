"use client";

import { useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload, faFolder, faFile, faCheck, faSpinner, faTrash } from "@fortawesome/free-solid-svg-icons";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  noteId?: string;
  chunks?: number;
}

export default function DropZone() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const uploadFiles = useCallback(async (fileList: File[], uploadedFiles: UploadedFile[]) => {
    setIsUploading(true);

    const formData = new FormData();
    fileList.forEach(file => {
      formData.append('files', file);
    });

    try {
      // Update status to uploading
      setFiles(prev => prev.map(f => 
        uploadedFiles.find(uf => uf.id === f.id) 
          ? { ...f, status: 'uploading' as const, progress: 50 }
          : f
      ));

      const response = await fetch('/api/ingest/files', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const results = await response.json();
      
      // Update files with success status
      setFiles(prev => prev.map(f => {
        const uploadedFile = uploadedFiles.find(uf => uf.id === f.id);
        if (uploadedFile) {
          const result = results.find((r: any) => r.title === uploadedFile.name.split('.')[0]);
          return {
            ...f,
            status: 'success' as const,
            progress: 100,
            noteId: result?.noteId,
            chunks: result?.countChunks
          };
        }
        return f;
      }));

    } catch (error) {
      console.error('Upload error:', error);
      
      // Update files with error status
      setFiles(prev => prev.map(f => 
        uploadedFiles.find(uf => uf.id === f.id) 
          ? { ...f, status: 'error' as const, progress: 0 }
          : f
      ));
    } finally {
      setIsUploading(false);
    }
  }, []);

  const processFiles = useCallback((fileList: File[]) => {
    // Accept all files - let the backend handle validation and processing
    const newFiles: UploadedFile[] = fileList.map(file => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending',
      progress: 0
    }));

    setFiles(prev => [...prev, ...newFiles]);
    uploadFiles(fileList, newFiles);
  }, [setFiles, uploadFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  }, [processFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      processFiles(selectedFiles);
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const clearAll = () => {
    setFiles([]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
        return <FontAwesomeIcon icon={faSpinner} className="animate-spin text-blue-500" />;
      case 'success':
        return <FontAwesomeIcon icon={faCheck} className="text-green-500" />;
      case 'error':
        return <FontAwesomeIcon icon={faTrash} className="text-red-500" />;
      default:
        return <FontAwesomeIcon icon={faFile} className="text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="space-y-4">
          <FontAwesomeIcon icon={faUpload} className="w-12 h-12 text-gray-400 mx-auto" />
          
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Drag and drop files here
            </h3>
            <p className="text-gray-500">
              or{' '}
              <label className="text-blue-600 hover:text-blue-500 cursor-pointer font-medium">
                browse to upload
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </p>
          </div>
          
          <p className="text-sm text-gray-400">
            All file types accepted - system will attempt to extract text content
          </p>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">
              Upload Queue ({files.length} files)
            </h3>
            <button
              onClick={clearAll}
              disabled={isUploading}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Clear All
            </button>
          </div>

          <div className="divide-y divide-gray-200">
            {files.map((file) => (
              <div key={file.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  <div className="flex-shrink-0">
                    {getStatusIcon(file.status)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      {file.chunks && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {file.chunks} chunks
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2 mt-1">
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)}
                      </p>
                      {file.status === 'uploading' && (
                        <div className="flex-1 max-w-xs">
                          <div className="bg-gray-200 rounded-full h-1">
                            <div
                              className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {file.status === 'success' && file.noteId && (
                    <span className="text-xs text-green-600 font-medium">
                      ID: {file.noteId.slice(0, 8)}...
                    </span>
                  )}
                  
                  {file.status === 'error' && (
                    <button
                      onClick={() => removeFile(file.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
