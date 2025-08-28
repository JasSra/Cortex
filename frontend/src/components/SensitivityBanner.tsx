"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faShield, faEye, faEyeSlash, faExclamationTriangle, faLock,
  faInfoCircle, faChevronDown, faChevronUp, faCog
} from "@fortawesome/free-solid-svg-icons";

interface SensitivityBannerProps {
  sensitivity: number;
  hasPii?: boolean;
  hasSecrets?: boolean;
  confidence?: number;
  redactionLevel?: number;
  onRedactionLevelChange?: (level: number) => void;
  className?: string;
  showControls?: boolean;
}

const SENSITIVITY_LEVELS = [
  { 
    level: 0, 
    name: "Public", 
    color: "text-green-800", 
    bg: "bg-green-100", 
    border: "border-green-300",
    description: "Safe for public sharing and external distribution"
  },
  { 
    level: 1, 
    name: "Internal", 
    color: "text-yellow-800", 
    bg: "bg-yellow-100", 
    border: "border-yellow-300",
    description: "Internal use only, not for external sharing"
  },
  { 
    level: 2, 
    name: "Confidential", 
    color: "text-orange-800", 
    bg: "bg-orange-100", 
    border: "border-orange-300",
    description: "Restricted access, contains sensitive information"
  },
  { 
    level: 3, 
    name: "Secret", 
    color: "text-red-800", 
    bg: "bg-red-100", 
    border: "border-red-300",
    description: "Highest security level, requires special authorization"
  },
];

export default function SensitivityBanner({
  sensitivity,
  hasPii = false,
  hasSecrets = false,
  confidence,
  redactionLevel,
  onRedactionLevelChange,
  className = "",
  showControls = false
}: SensitivityBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [showRedactionControls, setShowRedactionControls] = useState(false);

  const config = SENSITIVITY_LEVELS[sensitivity] || SENSITIVITY_LEVELS[0];
  const isHighRisk = sensitivity >= 2 || hasPii || hasSecrets;

  return (
    <div className={`${config.bg} ${config.border} border-l-4 rounded-r-lg ${className}`}>
      {/* Main Banner */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-3">
          <FontAwesomeIcon 
            icon={faShield} 
            className={`text-lg ${config.color}`}
          />
          <div>
            <div className="flex items-center space-x-2">
              <span className={`font-semibold ${config.color}`}>
                {config.name} Content
              </span>
              {confidence && (
                <span className="text-sm text-gray-600">
                  ({(confidence * 100).toFixed(1)}% confidence)
                </span>
              )}
            </div>
            <p className={`text-sm ${config.color} opacity-80`}>
              {config.description}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Risk Indicators */}
          {hasPii && (
            <span className="inline-flex items-center px-2 py-1 bg-orange-200 text-orange-800 rounded-md text-xs font-medium">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
              PII
            </span>
          )}
          {hasSecrets && (
            <span className="inline-flex items-center px-2 py-1 bg-red-200 text-red-800 rounded-md text-xs font-medium">
              <FontAwesomeIcon icon={faLock} className="mr-1" />
              Secrets
            </span>
          )}

          {/* Controls Toggle */}
          {showControls && (
            <button
              onClick={() => setShowRedactionControls(!showRedactionControls)}
              className={`px-2 py-1 rounded-md text-xs ${config.color} hover:bg-opacity-20 hover:bg-gray-500 transition-colors`}
              title="Redaction controls"
            >
              <FontAwesomeIcon icon={faCog} />
            </button>
          )}

          {/* Expand Toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className={`px-2 py-1 rounded-md text-xs ${config.color} hover:bg-opacity-20 hover:bg-gray-500 transition-colors`}
            title={expanded ? "Collapse details" : "Expand details"}
          >
            <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} />
          </button>
        </div>
      </div>

      {/* Redaction Controls */}
      {showRedactionControls && onRedactionLevelChange && (
        <div className="px-4 pb-2">
          <div className="bg-white bg-opacity-50 rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                <FontAwesomeIcon icon={faEye} className="mr-1" />
                Redaction Level
              </label>
              <span className="text-xs text-gray-600">
                Level {redactionLevel}
              </span>
            </div>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="3"
                value={redactionLevel}
                onChange={(e) => onRedactionLevelChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                title={`Current redaction level: ${redactionLevel}`}
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>Show All</span>
                <span>Hide Secret</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="bg-white bg-opacity-50 rounded-md p-3">
            <h4 className="text-sm font-medium text-gray-800 mb-2">
              <FontAwesomeIcon icon={faInfoCircle} className="mr-1" />
              Security Information
            </h4>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Classification Level:</span>
                <span className={`font-medium ${config.color}`}>
                  {sensitivity} ({config.name})
                </span>
              </div>
              
              {confidence && (
                <div className="flex justify-between">
                  <span className="text-gray-600">AI Confidence:</span>
                  <span className="font-medium">
                    {(confidence * 100).toFixed(1)}%
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-gray-600">Contains PII:</span>
                <span className={`font-medium ${hasPii ? 'text-orange-600' : 'text-green-600'}`}>
                  {hasPii ? 'Yes' : 'No'}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Contains Secrets:</span>
                <span className={`font-medium ${hasSecrets ? 'text-red-600' : 'text-green-600'}`}>
                  {hasSecrets ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {/* Recommendations */}
            {isHighRisk && (
              <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <h5 className="text-xs font-medium text-yellow-800 mb-1">
                  Security Recommendations:
                </h5>
                <ul className="text-xs text-yellow-700 space-y-1">
                  {sensitivity >= 2 && (
                    <li>• Limit access to authorized personnel only</li>
                  )}
                  {hasPii && (
                    <li>• Ensure GDPR/CCPA compliance when sharing</li>
                  )}
                  {hasSecrets && (
                    <li>• Review for exposed credentials or API keys</li>
                  )}
                  {sensitivity >= 3 && (
                    <li>• Consider additional encryption for storage</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
