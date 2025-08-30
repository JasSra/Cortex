# Usage:
#   scripts\export-training.ps1 [-Out data\training] [-Format jsonl|csv] [-MinWords 20] [-MaxCount 5000] 
#     [-TopicsUrl <url>] [-SensitivityUrl <url>]

param(
  [string]$Out = "data\training",
  [ValidateSet('jsonl','csv')][string]$Format = 'jsonl',
  [int]$MinWords = 20,
  [int]$MaxCount = 5000,
  [string]$TopicsUrl,
  [string]$SensitivityUrl
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$backend = Join-Path $root 'backend'
$outDir = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $root $Out }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "[Export] Generating training files from DB…"
& dotnet run --project $backend -- --export-training --out $outDir --format $Format --min-words $MinWords --max-count $MaxCount

$topicsFile = Join-Path $outDir ("topics." + $Format)
$sensFile = Join-Path $outDir ("sensitivity." + $Format)

function DownloadIfNeeded($url, $dest) {
  if ([string]::IsNullOrWhiteSpace($url)) { return }
  if (Test-Path $dest -PathType Leaf -and (Get-Item $dest).Length -gt 0) { return }
  Write-Host "[Download] $url -> $dest"
  try {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  } catch {
    Write-Warning "Failed to download $url: $_"
  }
}

if ($TopicsUrl) { DownloadIfNeeded $TopicsUrl $topicsFile }
if ($SensitivityUrl) { DownloadIfNeeded $SensitivityUrl $sensFile }

Write-Host "[Export] Done. Files at:"
Write-Host " - $topicsFile"
Write-Host " - $sensFile"

