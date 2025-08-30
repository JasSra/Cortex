#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/export-training.sh [--out data/training] [--format jsonl|csv] [--min-words N] [--max-count N] \
#     [--topics-url URL] [--sensitivity-url URL]
#
# Exports training files from the local DB. If export fails or files are missing and URLs are provided,
# it will attempt to download them.

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
BACKEND_DIR="$ROOT_DIR/backend"

OUT_DIR="$ROOT_DIR/data/training"
FORMAT="jsonl"
MIN_WORDS=20
MAX_COUNT=5000
TOPICS_URL=""
SENS_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT_DIR="$2"; shift 2;;
    --format) FORMAT="$2"; shift 2;;
    --min-words) MIN_WORDS="$2"; shift 2;;
    --max-count) MAX_COUNT="$2"; shift 2;;
    --topics-url) TOPICS_URL="$2"; shift 2;;
    --sensitivity-url) SENS_URL="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

mkdir -p "$OUT_DIR"

echo "[Export] Generating training files from DB…"
set +e
dotnet run --project "$BACKEND_DIR" -- --export-training --out "$OUT_DIR" --format "$FORMAT" --min-words "$MIN_WORDS" --max-count "$MAX_COUNT"
STATUS=$?
set -e

TOPICS_FILE="$OUT_DIR/topics.$FORMAT"
SENS_FILE="$OUT_DIR/sensitivity.$FORMAT"

need_download=false
if [[ ! -s "$TOPICS_FILE" && -n "$TOPICS_URL" ]]; then need_download=true; fi
if [[ ! -s "$SENS_FILE" && -n "$SENS_URL" ]]; then need_download=true; fi

if $need_download; then
  echo "[Export] Falling back to download for missing files…"
  if [[ -n "$TOPICS_URL" && ! -s "$TOPICS_FILE" ]]; then
    echo "[Download] $TOPICS_URL -> $TOPICS_FILE"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$TOPICS_URL" -o "$TOPICS_FILE"
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$TOPICS_FILE" "$TOPICS_URL"
    else
      echo "No curl/wget available to download topics file" >&2
    fi
  fi
  if [[ -n "$SENS_URL" && ! -s "$SENS_FILE" ]]; then
    echo "[Download] $SENS_URL -> $SENS_FILE"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$SENS_URL" -o "$SENS_FILE"
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$SENS_FILE" "$SENS_URL"
    else
      echo "No curl/wget available to download sensitivity file" >&2
    fi
  fi
fi

echo "[Export] Done. Files at:"
echo " - $TOPICS_FILE"
echo " - $SENS_FILE"

