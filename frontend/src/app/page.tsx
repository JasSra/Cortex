"use client";

import { useState } from "react";
import CommandDeck from "@/components/CommandDeck";
import DropZone from "@/components/DropZone";
import SearchPage from "@/components/SearchPage";
import Reader from "@/components/Reader";

export default function Home() {
  const [activeView, setActiveView] = useState<"upload" | "search" | "reader">("upload");
  const [selectedNote, setSelectedNote] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <CommandDeck />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <nav className="flex space-x-4">
            <button
              onClick={() => setActiveView("upload")}
              className={`px-4 py-2 rounded-lg ${
                activeView === "upload"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              Upload
            </button>
            <button
              onClick={() => setActiveView("search")}
              className={`px-4 py-2 rounded-lg ${
                activeView === "search"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              Search
            </button>
            {selectedNote && (
              <button
                onClick={() => setActiveView("reader")}
                className={`px-4 py-2 rounded-lg ${
                  activeView === "reader"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                Reader
              </button>
            )}
          </nav>
        </div>

        {activeView === "upload" && <DropZone />}
        
        {activeView === "search" && (
          <SearchPage 
            onNoteSelect={(noteId) => {
              setSelectedNote(noteId);
              setActiveView("reader");
            }} 
          />
        )}
        
        {activeView === "reader" && selectedNote && (
          <Reader noteId={selectedNote} />
        )}
      </main>
    </div>
  );
}
