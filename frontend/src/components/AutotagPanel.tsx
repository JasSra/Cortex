"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faRobot, faTag, faCheck, faTimes, faSpinner, faPlus, 
  faTrash, faEdit, faSave, faUndo, faStar, faChartBar
} from "@fortawesome/free-solid-svg-icons";
import { useClassificationApi, useTagsApi } from '@/services/apiClient';

interface AutotagSuggestion {
  tag: string;
  confidence: number;
  reasoning: string;
  category: string;
}

interface ClassificationResult {
  topics: string[];
  sensitivity: number;
  confidence: number;
  hasPii: boolean;
  hasSecrets: boolean;
  reasoning: string;
}

interface AutotagPanelProps {
  noteId: string;
  content: string;
  existingTags: string[];
  onTagsUpdated: (tags: string[]) => void;
  className?: string;
}

const CONFIDENCE_COLORS = {
  high: "text-green-600 bg-green-100",
  medium: "text-yellow-600 bg-yellow-100", 
  low: "text-red-600 bg-red-100"
};

const SENSITIVITY_LEVELS = [
  { level: 0, name: "Public", color: "text-green-600", bg: "bg-green-100" },
  { level: 1, name: "Internal", color: "text-yellow-600", bg: "bg-yellow-100" },
  { level: 2, name: "Confidential", color: "text-orange-600", bg: "bg-orange-100" },
  { level: 3, name: "Secret", color: "text-red-600", bg: "bg-red-100" },
];

export default function AutotagPanel({ 
  noteId, 
  content, 
  existingTags, 
  onTagsUpdated, 
  className = "" 
}: AutotagPanelProps) {
  const [suggestions, setSuggestions] = useState<AutotagSuggestion[]>([]);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [customTag, setCustomTag] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [workingTags, setWorkingTags] = useState<string[]>(existingTags);

  // Use the Cortex API clients
  const classificationApi = useClassificationApi()
  const tagsApi = useTagsApi()

  useEffect(() => {
    setWorkingTags(existingTags);
  }, [existingTags]);

  const generateSuggestions = async () => {
    if (!content.trim()) return;

    setLoading(true);
    try {
      // Get classification results using the Cortex client
      const classifyData = await classificationApi.classifyNote(noteId) as any
      setClassification(classifyData as ClassificationResult);

      // Note: Tag suggestions endpoint needs to be added to the generated client
      // For now, this would need to be implemented in the backend and added to OpenAPI
      // Using placeholder for tag suggestions functionality
      const mockSuggestions: AutotagSuggestion[] = []
      setSuggestions(mockSuggestions);
    } catch (error) {
      console.error("Error generating suggestions:", error);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceLevel = (confidence: number): keyof typeof CONFIDENCE_COLORS => {
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.6) return "medium";
    return "low";
  };

  const toggleSuggestion = (tag: string) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(tag)) {
      newSelected.delete(tag);
    } else {
      newSelected.add(tag);
    }
    setSelectedSuggestions(newSelected);
  };

  const applySelectedTags = () => {
    const newTags = [...workingTags];
    selectedSuggestions.forEach(tag => {
      if (!newTags.includes(tag)) {
        newTags.push(tag);
      }
    });
    setWorkingTags(newTags);
    setSelectedSuggestions(new Set());
  };

  const addCustomTag = () => {
    if (customTag.trim() && !workingTags.includes(customTag.trim())) {
      setWorkingTags([...workingTags, customTag.trim()]);
      setCustomTag("");
    }
  };

  const removeTag = (tag: string) => {
    setWorkingTags(workingTags.filter(t => t !== tag));
  };

  const saveTags = async () => {
    try {
      // Use the tags API to update tags for the note
      await tagsApi.addToNote(noteId, workingTags.filter(tag => !existingTags.includes(tag)))
      await tagsApi.removeFromNote(noteId, existingTags.filter(tag => !workingTags.includes(tag)))
      
      onTagsUpdated(workingTags);
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving tags:", error);
      alert("Failed to save tags");
    }
  };

  const cancelEditing = () => {
    setWorkingTags(existingTags);
    setIsEditing(false);
    setSelectedSuggestions(new Set());
  };

  const getSensitivityDisplay = (level: number) => {
    const config = SENSITIVITY_LEVELS[level];
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${config.bg} ${config.color}`}>
        <FontAwesomeIcon icon={faStar} className="mr-1" />
        {config.name}
      </span>
    );
  };

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          <FontAwesomeIcon icon={faRobot} className="mr-2 text-blue-600" />
          AI-Powered Tagging
        </h3>
        <div className="flex space-x-2">
          <button
            onClick={generateSuggestions}
            disabled={loading || !content.trim()}
            className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Generate new tag suggestions"
          >
            {loading ? (
              <FontAwesomeIcon icon={faSpinner} spin className="mr-1" />
            ) : (
              <FontAwesomeIcon icon={faRobot} className="mr-1" />
            )}
            {loading ? "Analyzing..." : "Analyze"}
          </button>
          {isEditing ? (
            <>
              <button
                onClick={saveTags}
                className="px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                title="Save tag changes"
              >
                <FontAwesomeIcon icon={faSave} className="mr-1" />
                Save
              </button>
              <button
                onClick={cancelEditing}
                className="px-3 py-1 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700"
                title="Cancel editing"
              >
                <FontAwesomeIcon icon={faUndo} className="mr-1" />
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700"
              title="Edit tags"
            >
              <FontAwesomeIcon icon={faEdit} className="mr-1" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Classification Results */}
      {classification && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            <FontAwesomeIcon icon={faChartBar} className="mr-1" />
            Content Classification
          </h4>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Sensitivity:</span>
              {getSensitivityDisplay(classification.sensitivity)}
              <span className="text-xs text-gray-500">
                ({(classification.confidence * 100).toFixed(1)}% confidence)
              </span>
            </div>
            {classification.topics.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Topics:</span>
                <div className="flex flex-wrap gap-1">
                  {classification.topics.map((topic) => (
                    <span
                      key={topic}
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center space-x-4 text-sm">
              <span className={`flex items-center ${classification.hasPii ? 'text-orange-600' : 'text-gray-500'}`}>
                <FontAwesomeIcon icon={faStar} className="mr-1" />
                PII: {classification.hasPii ? 'Detected' : 'None'}
              </span>
              <span className={`flex items-center ${classification.hasSecrets ? 'text-red-600' : 'text-gray-500'}`}>
                <FontAwesomeIcon icon={faStar} className="mr-1" />
                Secrets: {classification.hasSecrets ? 'Detected' : 'None'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Current Tags */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Current Tags
        </label>
        <div className="flex flex-wrap gap-2 min-h-[2.5rem] p-2 border border-gray-200 rounded-md">
          {workingTags.length === 0 ? (
            <span className="text-gray-500 text-sm italic">No tags yet</span>
          ) : (
            workingTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 rounded-md text-sm"
              >
                <FontAwesomeIcon icon={faTag} className="mr-1" />
                {tag}
                {isEditing && (
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-2 text-green-600 hover:text-green-800"
                    title={`Remove tag: ${tag}`}
                  >
                    <FontAwesomeIcon icon={faTimes} className="text-xs" />
                  </button>
                )}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Custom Tag Input */}
      {isEditing && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Add Custom Tag
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Enter custom tag..."
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addCustomTag()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={addCustomTag}
              disabled={!customTag.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Add custom tag"
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
        </div>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              AI Suggestions ({suggestions.length})
            </label>
            {selectedSuggestions.size > 0 && (
              <button
                onClick={applySelectedTags}
                className="px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                title={`Apply ${selectedSuggestions.size} selected tags`}
              >
                <FontAwesomeIcon icon={faCheck} className="mr-1" />
                Apply Selected ({selectedSuggestions.size})
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {suggestions.map((suggestion) => {
              const confidenceLevel = getConfidenceLevel(suggestion.confidence);
              const isSelected = selectedSuggestions.has(suggestion.tag);
              const isExisting = workingTags.includes(suggestion.tag);

              return (
                <div
                  key={suggestion.tag}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? "border-blue-500 bg-blue-50"
                      : isExisting
                      ? "border-gray-300 bg-gray-50 opacity-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                  onClick={() => !isExisting && toggleSuggestion(suggestion.tag)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">
                        {suggestion.tag}
                      </span>
                      {isExisting && (
                        <span className="text-xs text-gray-500 italic">
                          (already applied)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-medium ${CONFIDENCE_COLORS[confidenceLevel]}`}
                      >
                        {(suggestion.confidence * 100).toFixed(0)}%
                      </span>
                      {!isExisting && (
                        <FontAwesomeIcon
                          icon={isSelected ? faCheck : faPlus}
                          className={`text-sm ${
                            isSelected ? "text-blue-600" : "text-gray-400"
                          }`}
                        />
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Category:</span> {suggestion.category}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">Reasoning:</span> {suggestion.reasoning}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {suggestions.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          <FontAwesomeIcon icon={faRobot} className="text-4xl mb-2" />
          <p>Click &quot;Analyze&quot; to get AI-powered tag suggestions</p>
          <p className="text-sm">AI will analyze content for topics, sensitivity, and more</p>
        </div>
      )}
    </div>
  );
}
