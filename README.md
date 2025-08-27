# Cortex - Voice-First Notes Brain

A modern voice-first knowledge management system that enables natural language interaction with your document collection through speech-to-text, intelligent search, and text-to-speech capabilities.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Git

### Run with Docker Compose

```bash
# Clone the repository
git clone <your-repo-url>
cd Cortex

# Start all services
docker compose up

# In another terminal, seed with example data
./scripts/seed.sh
```

**Access Points:**
- 🌐 **Frontend**: http://localhost:3000
- 🔧 **API**: http://localhost:8080
- 📚 **API Docs**: http://localhost:8080/swagger
- 🔍 **Redis Insight**: http://localhost:8001

## 🏗️ Architecture

### Stack
- **Frontend**: Next.js 14, Tailwind CSS, PWA-enabled
- **Backend**: .NET 8 Minimal API
- **Database**: SQLite with FTS5 for search
- **Cache**: Redis Stack (RediSearch + JSON)
- **Speech**: Faster-Whisper (STT) + Piper (TTS)
- **LLM**: Ollama (local) or OpenAI (cloud)

### Services
- `frontend`: Next.js web application (port 3000)
- `backend`: .NET API server (port 8080)
- `redis`: Redis Stack for caching (port 6379)
- `ollama`: Local LLM server (port 11434)
- `faster-whisper`: Speech-to-text (port 8001)
- `piper`: Text-to-speech (port 8002)

## 📋 Features

### ✅ Stage 1 (Current)
- [x] **File Ingestion**: Drag-drop .txt/.md/.pdf/.docx files
- [x] **Smart Chunking**: 800-1200 token semantic chunks
- [x] **Voice Interface**: WebRTC → STT → Live transcript
- [x] **Full-Text Search**: BM25 ranking with filters
- [x] **Document Reader**: Two-pane view with chunk navigation
- [x] **Deduplication**: SHA-256 based file deduplication
- [x] **Multi-format**: PDF, DOCX, Markdown, Text support

### 🎯 Performance Targets
- ✅ Ingest 200+ files in ≤10 minutes
- ✅ Voice round-trip: "List latest notes" → TTS reply
- ✅ Real-time voice transcription with partial results

## 🎮 Usage

### Upload Documents
1. Click "Upload" tab
2. Drag files or click "browse to upload"
3. Watch progress and see chunk counts
4. Files stored in `/data/raw/YYYY/MM/`

### Voice Search
1. Click microphone button in top bar
2. Speak your query naturally
3. See live transcript and intent detection
4. Click "Confirm" to execute search

### Text Search
1. Click "Search" tab
2. Type query in search box
3. Apply filters (file type, date range)
4. Click results to open in Reader

### Document Reading
1. View original content or chunks
2. Click chunks to see token counts
3. Navigate between original and processed views

## 🔧 Configuration

### Environment Variables

```bash
# LLM Configuration
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2:3b
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-4o-mini

# Speech Services
STT_URL=http://faster-whisper:8001
TTS_URL=http://piper:8002

# Storage
DATA_DIR=/app/data
ALLOW_LOCAL_SCAN=true

# Database
ConnectionStrings__DefaultConnection=Data Source=/app/data/cortex.db
Redis__ConnectionString=redis:6379
```

### Development Setup

```bash
# Backend
cd backend
dotnet restore
dotnet run

# Frontend
cd frontend
npm install
npm run dev

# Tests
npm install @playwright/test
Run end-to-end voice tests (requires OpenAI key configured in backend appsettings):

- Start backend (listens on http://localhost:8080 by default)
- From repo root:
	- dotnet test .\tests\E2E\E2E.csproj

You can override target API with env var CORTEX_API_URL.
```

## 🧪 Testing

### Smoke Tests
```bash
# Run Playwright tests
npx playwright test

# Specific test suites
npx playwright test --grep "voice"
npx playwright test --grep "upload"
npx playwright test --grep "search"
```

### Manual Testing
1. **Upload Test**: Drop a .txt file, verify chunking
2. **Search Test**: Search for keywords, check relevance
3. **Voice Test**: Use mic, verify transcript accuracy

## 📁 Project Structure

```
Cortex/
├── backend/                # .NET 8 API
│   ├── Data/              # Entity Framework context
│   ├── Models/            # Data models
│   ├── Services/          # Business logic
│   └── Program.cs         # API endpoints
├── frontend/              # Next.js application
│   ├── src/app/          # App router pages
│   └── src/components/   # React components
├── data/                  # Persistent data
│   └── raw/              # Uploaded files
├── examples/             # Sample documents
├── scripts/              # Utility scripts
├── tests/                # Playwright tests
└── docker-compose.yaml   # Multi-service setup
```

## 🔌 API Reference

### Upload
```http
POST /ingest/files
Content-Type: multipart/form-data

# Response: [{"noteId": "...", "title": "...", "countChunks": 5}]
```

### Search
```http
GET /search?q=query&limit=20&fileType=.md&dateFrom=2024-01-01

# Response: [{"noteId": "...", "title": "...", "chunkContent": "...", "score": 0.95}]
```

### Voice
```http
# WebSocket connection for real-time STT
WS /voice/stt

# Text-to-speech
POST /voice/tts
{"text": "Hello world"}
```

### Notes
```http
GET /notes/{id}

# Response: {"id": "...", "title": "...", "chunks": [...]}
```

## 🐛 Troubleshooting

### Common Issues

**"API not available"**
- Check if backend is running: `curl http://localhost:8080/health`
- Verify Docker containers: `docker compose ps`

**"Voice not working"**
- Check microphone permissions in browser
- Verify WebSocket connection in Developer Tools
- Ensure faster-whisper service is running

**"No search results"**
- Run seed script: `./scripts/seed.sh`
- Check if files uploaded successfully
- Verify SQLite database exists in `/data/`

**"Upload fails"**
- Check supported file types: .txt, .md, .pdf, .docx
- Verify file isn't corrupted
- Check available disk space

### Development Issues

**Frontend build errors**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

**Backend compilation errors**
```bash
cd backend
dotnet clean
dotnet restore
dotnet build
```

## 🚧 Roadmap

### Stage 2 (Planned)
- [ ] Vector embeddings for semantic search
- [ ] Multi-modal support (images, audio)
- [ ] Collaborative features and sharing
- [ ] Advanced NLP processing

### Stage 3 (Vision)
- [ ] Real-time collaboration
- [ ] Plugin architecture
- [ ] Enterprise deployment options
- [ ] Mobile applications

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Faster-Whisper](https://github.com/guillaumekln/faster-whisper) for speech recognition
- [Piper](https://github.com/rhasspy/piper) for text-to-speech
- [Ollama](https://ollama.ai/) for local LLM hosting
- [Next.js](https://nextjs.org/) and [.NET](https://dotnet.microsoft.com/) teams