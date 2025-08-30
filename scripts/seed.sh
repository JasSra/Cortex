#!/bin/bash

# Seed script to ingest example files into Cortex

set -e

API_URL="http://localhost:8080"
EXAMPLES_DIR="./examples"

echo "🌱 Seeding Cortex with example files..."

# Check if API is available
if ! curl -s "$API_URL/health" > /dev/null; then
    echo "❌ API not available at $API_URL"
    echo "Please start the backend first with: cd backend && dotnet run"
    exit 1
fi

echo "✅ API is running"

# Function to upload a single file
upload_file() {
    local file_path="$1"
    local file_name=$(basename "$file_path")
    
    echo "📄 Uploading: $file_name"
    
    response=$(curl -s -w "%{http_code}" -o /tmp/upload_response.json \
        -X POST "$API_URL/ingest/files" \
        -F "files=@$file_path")
    
    if [ "$response" = "200" ]; then
        echo "✅ Successfully uploaded: $file_name"
        if command -v jq > /dev/null; then
            cat /tmp/upload_response.json | jq -r '.[] | "   → Note ID: \(.noteId), Chunks: \(.countChunks)"'
        fi
    else
        echo "❌ Failed to upload: $file_name (HTTP $response)"
        cat /tmp/upload_response.json 2>/dev/null || echo "No response body"
    fi
    echo ""
}

# Upload all markdown and text files from examples directory
if [ -d "$EXAMPLES_DIR" ]; then
    echo "📁 Processing files in $EXAMPLES_DIR"
    
    for file in "$EXAMPLES_DIR"/*.md "$EXAMPLES_DIR"/*.txt; do
        if [ -f "$file" ]; then
            upload_file "$file"
        fi
    done
else
    echo "❌ Examples directory not found: $EXAMPLES_DIR"
    exit 1
fi

echo "🎉 Seeding complete!"

# Verify by doing a test search
echo "🔍 Testing search functionality..."
search_response=$(curl -s "$API_URL/search?q=cortex&limit=5")

if echo "$search_response" | grep -q "noteId"; then
    echo "✅ Search is working! Found results for 'cortex'"
    if command -v jq > /dev/null; then
        echo "$search_response" | jq -r '.[] | "   → \(.title) (\(.fileType))"'
    fi
else
    echo "⚠️  Search returned no results, but files were uploaded"
fi

echo ""
echo "🚀 Ready to use Cortex!"
echo "   Frontend: http://localhost:3000"
echo "   API Docs: http://localhost:8080/swagger"
