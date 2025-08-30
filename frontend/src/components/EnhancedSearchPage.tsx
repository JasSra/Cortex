"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faSearch, faFilter, faCalendar, faFile, faRobot, faShield, 
  faTag, faEye, faEyeSlash, faMicrophone, faCog, faTimes,
  faExclamationTriangle, faLock
} from "@fortawesome/free-solid-svg-icons";

interface SearchResult {
  noteId: string;
  title: string;
  chunkContent: string;
  fileType: string;
  createdAt: string;
  score: number;
  sensitivity?: number;
  topics?: string[];
  hasPii?: boolean;
  hasSecrets?: boolean;
  tags?: string[];
}

interface SearchPageProps {
  onNoteSelect: (noteId: string) => void;
}

const SENSITIVITY_LEVELS = [
  { level: 0, name: "Public", color: "text-green-600", bg: "bg-green-100" },
  { level: 1, name: "Internal", color: "text-yellow-600", bg: "bg-yellow-100" },
  { level: 2, name: "Confidential", color: "text-orange-600", bg: "bg-orange-100" },
  { level: 3, name: "Secret", color: "text-red-600", bg: "bg-red-100" },
];

const AVAILABLE_TOPICS = [
  "tech", "legal", "finance", "personal", "health", "travel", 
  "projects", "code", "credentials", "documentation", "research"
];

export default function SearchPage({ onNoteSelect }: SearchPageProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<"semantic" | "hybrid" | "bm25">("hybrid");
  const [filters, setFilters] = useState({
    fileType: "",
    dateFrom: "",
    dateTo: "",
    topics: [] as string[],
    sensitivity: [] as number[],
    hasPii: undefined as boolean | undefined,
    hasSecrets: undefined as boolean | undefined,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [redactionLevel, setRedactionLevel] = useState(2);
  const [voicePin, setVoicePin] = useState("");
  const [showVoicePinDialog, setShowVoicePinDialog] = useState(false);

  const handleSearchWithQuery = useCallback(async (searchQuery?: string) => {
    const searchTerm = searchQuery || query;
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const searchPayload = {
        q: searchTerm,
        k: 20,
        mode: searchMode,
        filters: {
          ...(filters.fileType && { fileType: filters.fileType }),
          ...(filters.topics.length > 0 && { topics: filters.topics }),
          ...(filters.sensitivity.length > 0 && { sensitivity: filters.sensitivity }),
          ...(filters.hasPii !== undefined && { hasPii: filters.hasPii }),
          ...(filters.hasSecrets !== undefined && { hasSecrets: filters.hasSecrets }),
          ...(filters.dateFrom && filters.dateTo && { 
            dateRange: { start: filters.dateFrom, end: filters.dateTo } 
          }),
        }
      };

      const response = await fetch("/api/search/advanced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchPayload),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, searchMode, filters]);

  const handleSearch = useCallback(() => handleSearchWithQuery(), [handleSearchWithQuery]);

  // Check for global search query on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const globalSearchQuery = window.localStorage.getItem('globalSearchQuery');
      if (globalSearchQuery) {
        setQuery(globalSearchQuery);
        // Clear the stored query
        window.localStorage.removeItem('globalSearchQuery');
        // Auto-execute search after a brief delay to let the component settle
        setTimeout(() => {
          handleSearchWithQuery(globalSearchQuery);
        }, 100);
      }
    }
  }, [handleSearchWithQuery]);

  const handleTopicToggle = (topic: string) => {
    setFilters(prev => ({
      ...prev,
      topics: prev.topics.includes(topic)
        ? prev.topics.filter(t => t !== topic)
        : [...prev.topics, topic]
    }));
  };

  const handleSensitivityToggle = (level: number) => {
    setFilters(prev => ({
      ...prev,
      sensitivity: prev.sensitivity.includes(level)
        ? prev.sensitivity.filter(s => s !== level)
        : [...prev.sensitivity, level]
    }));
  };

  const getSensitivityDisplay = (level?: number) => {
    if (level === undefined) return null;
    const config = SENSITIVITY_LEVELS[level];
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${config.bg} ${config.color}`}>
        <FontAwesomeIcon icon={faShield} className="mr-1" />
        {config.name}
      </span>
    );
  };

  const shouldRedactContent = (result: SearchResult) => {
    return (result.sensitivity || 0) >= redactionLevel;
  };

  const handleRevealContent = (noteId: string) => {
    if (redactionLevel >= 3) {
      setShowVoicePinDialog(true);
    } else {
      // For levels < 3, just reveal the content
      setRedactionLevel(3);
    }
  };

  const handleVoicePinSubmit = async () => {
    try {
      const response = await fetch("/api/redaction/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: voicePin }),
      });

      if (response.ok) {
        setRedactionLevel(0); // Reveal all content
        setShowVoicePinDialog(false);
        setVoicePin("");
      } else {
        alert("Invalid PIN");
      }
    } catch (error) {
      console.error("PIN verification error:", error);
      alert("PIN verification failed");
    }
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        handleSearch();
      }
    };

    const searchInput = document.getElementById("search-input");
    searchInput?.addEventListener("keypress", handleKeyPress);
    return () => searchInput?.removeEventListener("keypress", handleKeyPress);
  }, [query, searchMode, filters]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Search Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          <FontAwesomeIcon icon={faSearch} className="mr-3 text-blue-600" />
          Enhanced Knowledge Search
        </h1>
        <p className="text-gray-600">
          AI-powered search with classification, sensitivity filtering, and PII detection
        </p>
      </div>

      {/* Search Input */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex flex-col space-y-4">
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <input
                id="search-input"
                type="text"
                placeholder="Search your knowledge base..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <FontAwesomeIcon 
                icon={faSearch} 
                className="absolute right-3 top-3 text-gray-400"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>

          {/* Search Mode Toggle */}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Search Mode:</span>
            {["semantic", "hybrid", "bm25"].map((mode) => (
              <label key={mode} className="flex items-center">
                <input
                  type="radio"
                  name="searchMode"
                  value={mode}
                  checked={searchMode === mode}
                  onChange={(e) => setSearchMode(e.target.value as typeof searchMode)}
                  className="mr-2"
                />
                <span className="text-sm capitalize">
                  {mode} {mode === "hybrid" && "🤖"}
                </span>
              </label>
            ))}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="ml-auto px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              <FontAwesomeIcon icon={faFilter} className="mr-1" />
              Advanced Filters
            </button>
          </div>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* File Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  File Type
                </label>
                <select
                  value={filters.fileType}
                  onChange={(e) => setFilters(prev => ({ ...prev, fileType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  title="Select file type"
                >
                  <option value="">All Types</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">Word</option>
                  <option value="txt">Text</option>
                  <option value="md">Markdown</option>
                </select>
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date From
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  title="Start date filter"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date To
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  title="End date filter"
                />
              </div>
            </div>

            {/* Topics Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Topics
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => handleTopicToggle(topic)}
                    className={`px-3 py-1 rounded-full text-sm ${
                      filters.topics.includes(topic)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    <FontAwesomeIcon icon={faTag} className="mr-1" />
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* Sensitivity Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sensitivity Levels
              </label>
              <div className="flex flex-wrap gap-2">
                {SENSITIVITY_LEVELS.map((level) => (
                  <button
                    key={level.level}
                    onClick={() => handleSensitivityToggle(level.level)}
                    className={`px-3 py-1 rounded-full text-sm ${
                      filters.sensitivity.includes(level.level)
                        ? `${level.bg} ${level.color} ring-2 ring-offset-1 ring-current`
                        : `${level.bg} ${level.color} hover:ring-1 hover:ring-current`
                    }`}
                  >
                    <FontAwesomeIcon icon={faShield} className="mr-1" />
                    {level.name}
                  </button>
                ))}
              </div>
            </div>

            {/* PII/Secrets Filters */}
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.hasPii === true}
                  onChange={(e) => setFilters(prev => ({ 
                    ...prev, 
                    hasPii: e.target.checked ? true : undefined 
                  }))}
                  className="mr-2"
                />
                <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1 text-orange-500" />
                Contains PII
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.hasSecrets === true}
                  onChange={(e) => setFilters(prev => ({ 
                    ...prev, 
                    hasSecrets: e.target.checked ? true : undefined 
                  }))}
                  className="mr-2"
                />
                <FontAwesomeIcon icon={faLock} className="mr-1 text-red-500" />
                Contains Secrets
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Redaction Controls */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Redaction Level:</span>
            <select
              value={redactionLevel}
              onChange={(e) => setRedactionLevel(Number(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              title="Select redaction level"
            >
              {SENSITIVITY_LEVELS.map((level) => (
                <option key={level.level} value={level.level}>
                  {level.name} (Level {level.level})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowVoicePinDialog(true)}
            className="px-3 py-1 bg-red-100 text-red-700 rounded-md text-sm hover:bg-red-200"
          >
            <FontAwesomeIcon icon={faMicrophone} className="mr-1" />
            Voice PIN Access
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4">
        {results.length === 0 && !loading && query && (
          <div className="text-center py-12 text-gray-500">
            <FontAwesomeIcon icon={faSearch} className="text-4xl mb-4" />
            <p>No results found for &quot;{query}&quot;</p>
            <p className="text-sm">Try adjusting your search terms or filters</p>
          </div>
        )}

        {results.map((result) => (
          <div
            key={result.noteId}
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => onNoteSelect(result.noteId)}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                {result.title}
              </h3>
              <div className="flex items-center space-x-2">
                {getSensitivityDisplay(result.sensitivity)}
                <span className="text-xs text-gray-500">
                  Score: {result.score?.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4 mb-3 text-sm text-gray-600">
              <span>
                <FontAwesomeIcon icon={faFile} className="mr-1" />
                {result.fileType?.toUpperCase() || "Unknown"}
              </span>
              <span>
                <FontAwesomeIcon icon={faCalendar} className="mr-1" />
                {new Date(result.createdAt).toLocaleDateString()}
              </span>
              {result.hasPii && (
                <span className="text-orange-600">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
                  PII
                </span>
              )}
              {result.hasSecrets && (
                <span className="text-red-600">
                  <FontAwesomeIcon icon={faLock} className="mr-1" />
                  Secrets
                </span>
              )}
            </div>

            {/* Topics/Tags */}
            {(result.topics?.length || result.tags?.length) && (
              <div className="flex flex-wrap gap-1 mb-3">
                {result.topics?.map((topic) => (
                  <span
                    key={topic}
                    className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs"
                  >
                    <FontAwesomeIcon icon={faRobot} className="mr-1" />
                    {topic}
                  </span>
                ))}
                {result.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-xs"
                  >
                    <FontAwesomeIcon icon={faTag} className="mr-1" />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Content Preview */}
            <div className="text-gray-700">
              {shouldRedactContent(result) ? (
                <div className="bg-gray-100 p-3 rounded-md">
                  <p className="text-gray-500 italic mb-2">
                    <FontAwesomeIcon icon={faEyeSlash} className="mr-2" />
                    Content redacted due to sensitivity level
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRevealContent(result.noteId);
                    }}
                    className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                  >
                    <FontAwesomeIcon icon={faEye} className="mr-1" />
                    Reveal Content
                  </button>
                </div>
              ) : (
                <p className="text-gray-700 line-clamp-3">
                  {result.chunkContent}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Voice PIN Dialog */}
      {showVoicePinDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Voice PIN Required</h3>
              <button
                onClick={() => setShowVoicePinDialog(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <p className="text-gray-600 mb-4">
              This content requires voice PIN authentication to access.
            </p>
            <div className="space-y-4">
              <input
                type="password"
                placeholder="Enter your voice PIN"
                value={voicePin}
                onChange={(e) => setVoicePin(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === "Enter" && handleVoicePinSubmit()}
              />
              <div className="flex space-x-2">
                <button
                  onClick={handleVoicePinSubmit}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <FontAwesomeIcon icon={faMicrophone} className="mr-2" />
                  Verify PIN
                </button>
                <button
                  onClick={() => setShowVoicePinDialog(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
