You are a senior full-stack engineer. Build Stage-1 of a voice-first notes brain.

A. Stack
1) Frontend: Next.js 14 (App Router) + Tailwind + Log UI (use shadcn/ui components), Headless UI, Font Awesome. PWA enabled.
2) Backend: .NET 8 Minimal API. SQLite for metadata. Redis Stack (RediSearch + JSON) for cache/queues. Filesystem for raw notes.
3) Models: STT via faster-whisper server (HTTP), TTS via Piper server (HTTP).
4) LLM router: support both Ollama and OpenAI. Runtime-switch with env flags.

B. Features
1) Dropzone: drag-drop folders/files (.txt/.md/.pdf/.docx), progress, dedupe by SHA-256, store under /data/raw/YYYY/MM/.
2) Ingest: text extraction, normalize to UTF-8, split into semantic chunks ~800–1200 tokens (sentence-aware).
3) Voice loop: WebRTC mic → WS to backend → stream to STT → partial captions → UI live transcript. TTS reply stream back.
4) Simple chat: “system / user” prompt box hidden; voice controls: Start/Stop/Confirm/Undo. Wake-word placeholder.
5) Minimal search: BM25 over chunks (SQLite FTS5) + filters (tag, date, filetype).

C. API (document with OpenAPI)
1) POST /ingest/files (multipart) → [{noteId,title,countChunks}]
2) POST /ingest/folder { path:"{{ PATH }}"}  (enable only if ALLOW_LOCAL_SCAN=true)
3) GET /notes/{id} → original + chunks
4) GET /search?q=&limit=&filters=
5) WS /voice/stt  (proxy to faster-whisper), POST /voice/tts {text}
6) POST /chat/stream {prompt, provider:"ollama|openai"} (SSE)

D. Config (env)
1) OLLAMA_URL={{ OLLAMA_URL }}, OLLAMA_MODEL={{ OLLAMA_MODEL }}
2) OPENAI_API_KEY={{ OPENAI_API_KEY }}, OPENAI_MODEL={{ OPENAI_MODEL }}
3) STT_URL={{ STT_URL }}, TTS_URL={{ TTS_URL }}
4) DATA_DIR={{ ABS_PATH }}, ALLOW_LOCAL_SCAN={{ true|false }}

E. UI
1) Command Deck (top bar): mic state, live transcript, intent chips (placeholder), Confirm/Undo buttons.
2) Reader: two-pane (original vs preview-redacted stub), metadata pill row, file breadcrumbs.
3) Search page: one box + facets.

F. Output
1) Full repo with docker-compose.yaml to run web/api/redis/sqlite-mounted/ollama/stt/tts.
2) Smoke tests (Playwright) for: ingest .txt, search returns, voice round-trip (mock STT/TTS).
3) Seed script to ingest /examples/*.md.
4) README with run cmds.

Definition of Done
– “docker compose up” → web on 3000, api on 8080.  
– Ingest ≥200 files in ≤10 min on a typical laptop.  
– Voice ask “List latest notes” → TTS reply.
