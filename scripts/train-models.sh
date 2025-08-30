#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/train-models.sh <topics_file> <sensitivity_file>
# Files can be CSV or JSONL.
#  - Topics CSV: "text","topic"
#  - Sensitivity CSV: "text",score (0..1)
#  - JSONL: { "text": "...", "topic": "..." } and { "text": "...", "sensitivityScore": 0.85 }

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
BACKEND_DIR="$ROOT_DIR/backend"

TOPIC_FILE="${1:-}"
SENS_FILE="${2:-}"

if [[ -z "$TOPIC_FILE" && -z "$SENS_FILE" ]]; then
  echo "Provide at least one file: topics and/or sensitivity"
  echo "Example: scripts/train-models.sh data/topics.jsonl data/sensitivity.csv"
  exit 1
fi

ARGS=("--train-models")
if [[ -n "$TOPIC_FILE" ]]; then
  ARGS+=("--topic" "$TOPIC_FILE")
fi
if [[ -n "$SENS_FILE" ]]; then
  ARGS+=("--sensitivity" "$SENS_FILE")
fi

echo "[Train] Running backend in training mode…"
dotnet run --project "$BACKEND_DIR" -- "${ARGS[@]}"

echo "[Train] Completed. Models stored under backend/bin/<Config>/net8.0/Models"

