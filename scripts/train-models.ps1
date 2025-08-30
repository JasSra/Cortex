# Usage:
#   scripts/train-models.ps1 -TopicsFile data\topics.jsonl -SensitivityFile data\sensitivity.csv
# Files can be CSV or JSONL.
#  - Topics CSV: "text","topic"
#  - Sensitivity CSV: "text",score (0..1)
#  - JSONL: { "text": "...", "topic": "..." } and { "text": "...", "sensitivityScore": 0.85 }

param(
  [string]$TopicsFile,
  [string]$SensitivityFile
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$backend = Join-Path $root 'backend'

if (-not $TopicsFile -and -not $SensitivityFile) {
  Write-Host "Provide at least one file: -TopicsFile and/or -SensitivityFile" -ForegroundColor Yellow
  Write-Host "Example: scripts\train-models.ps1 -TopicsFile data\topics.jsonl -SensitivityFile data\sensitivity.csv"
  exit 1
}

$argsList = @('--train-models')
if ($TopicsFile) { $argsList += @('--topic', $TopicsFile) }
if ($SensitivityFile) { $argsList += @('--sensitivity', $SensitivityFile) }

Write-Host "[Train] Running backend in training mode…"
& dotnet run --project $backend -- @argsList

Write-Host "[Train] Completed. Models stored under backend\bin\<Config>\net8.0\Models"

