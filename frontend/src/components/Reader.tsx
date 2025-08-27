"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile, faCalendar, faLayerGroup, faEye, faCode } from "@fortawesome/free-solid-svg-icons";

interface Note {
  id: string;
  title: string;
  originalPath: string;
  filePath: string;
  fileType: string;
  fileSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  chunkCount: number;
  tags: string;
  chunks: NoteChunk[];
}

interface NoteChunk {
  id: string;
  noteId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  createdAt: string;
}

interface ReaderProps {
  noteId: string;
}

export default function Reader({ noteId }: ReaderProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"original" | "chunks">("original");
  const [selectedChunk, setSelectedChunk] = useState<number | null>(null);

  useEffect(() => {
    const fetchNote = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/notes/${noteId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch note");
        }
        const data = await response.json();
        setNote(data);
      } catch (error) {
        console.error("Error fetching note:", error);
      } finally {
        setLoading(false);
      }
    };

    if (noteId) {
      fetchNote();
    }
  }, [noteId]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getFileTypeColor = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case ".md":
        return "bg-blue-100 text-blue-800";
      case ".txt":
        return "bg-gray-100 text-gray-800";
      case ".pdf":
        return "bg-red-100 text-red-800";
      case ".docx":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-8"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-96 bg-gray-200 rounded"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="max-w-6xl mx-auto text-center py-12">
        <p className="text-gray-500">Note not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{note.title}</h1>
            <div className="text-sm text-gray-500 space-y-1">
              <div>Path: {note.originalPath}</div>
              <div>ID: {note.id}</div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getFileTypeColor(note.fileType)}`}>
              <FontAwesomeIcon icon={faFile} className="mr-1" />
              {note.fileType.replace(".", "").toUpperCase()}
            </span>
          </div>
        </div>

        {/* Metadata Pills */}
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="flex items-center space-x-1 text-gray-600">
            <FontAwesomeIcon icon={faCalendar} />
            <span>Created: {formatDate(note.createdAt)}</span>
          </div>
          
          <div className="flex items-center space-x-1 text-gray-600">
            <FontAwesomeIcon icon={faLayerGroup} />
            <span>{note.chunkCount} chunks</span>
          </div>
          
          <div className="flex items-center space-x-1 text-gray-600">
            <span>Size: {formatFileSize(note.fileSizeBytes)}</span>
          </div>
          
          <div className="flex items-center space-x-1 text-gray-600">
            <span>Total tokens: {note.chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0)}</span>
          </div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex space-x-2">
        <button
          onClick={() => setActiveView("original")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === "original"
              ? "bg-blue-500 text-white"
              : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          }`}
        >
          <FontAwesomeIcon icon={faEye} className="mr-2" />
          Original View
        </button>
        
        <button
          onClick={() => setActiveView("chunks")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === "chunks"
              ? "bg-blue-500 text-white"
              : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          }`}
        >
          <FontAwesomeIcon icon={faCode} className="mr-2" />
          Chunks View ({note.chunkCount})
        </button>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Pane - Original/Chunks */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              {activeView === "original" ? "Original Content" : "Chunks"}
            </h3>
          </div>
          
          <div className="p-6">
            {activeView === "original" ? (
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                  {note.chunks.map(chunk => chunk.content).join("\n\n")}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {note.chunks
                  .sort((a, b) => a.chunkIndex - b.chunkIndex)
                  .map((chunk) => (
                    <div
                      key={chunk.id}
                      onClick={() => setSelectedChunk(selectedChunk === chunk.chunkIndex ? null : chunk.chunkIndex)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedChunk === chunk.chunkIndex
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-600">
                          Chunk {chunk.chunkIndex + 1}
                        </span>
                        <span className="text-xs text-gray-500">
                          {chunk.tokenCount} tokens
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-700 line-clamp-3">
                        {chunk.content}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane - Preview/Selected Chunk */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              {selectedChunk !== null ? `Chunk ${selectedChunk + 1} Detail` : "Preview"}
            </h3>
          </div>
          
          <div className="p-6">
            {selectedChunk !== null ? (
              <div className="space-y-4">
                {(() => {
                  const chunk = note.chunks.find(c => c.chunkIndex === selectedChunk);
                  if (!chunk) return <p className="text-gray-500">Chunk not found</p>;
                  
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-600">Index:</span>
                          <span className="ml-2">{chunk.chunkIndex + 1}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Tokens:</span>
                          <span className="ml-2">{chunk.tokenCount}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium text-gray-600">Created:</span>
                          <span className="ml-2">{formatDate(chunk.createdAt)}</span>
                        </div>
                      </div>
                      
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-900 mb-2">Content</h4>
                        <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                          {chunk.content}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-12">
                <FontAwesomeIcon icon={faEye} className="w-12 h-12 text-gray-300 mb-4" />
                <p className="text-gray-500">
                  {activeView === "chunks" 
                    ? "Select a chunk to view details"
                    : "Preview will show chunk details when selected"
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
