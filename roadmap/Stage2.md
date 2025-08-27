Extend Stage-1 to Stage-2: auto-classify, auto-tag, embeddings search, sensitivity policy.

A. Data
1) Add tables: Tags(id,name), NoteTags(noteId,tagId), Chunks(embedVec?), Entities(id,type,value), Spans(noteId,start,end,label).
2) Add fields to notes/chunks: sensitivity_level INT(0–3), pii_flags JSON, secret_flags JSON, summary TEXT.

B. Detection pipeline
1) Secrets: integrate gitleaks ruleset (regex) as a .NET library or subprocess; produce secret_flags + severity.
2) PII: Presidio-like detectors via regex + ML.NET (fallback) for AU patterns (TFN/Medicare/ABN), emails, phones, IBAN/BIC; keep rules in /config/policy/*.yaml.
3) Topics/Tags: ML.NET pipeline:
   - Text featurization (stopwords, char/word n-grams).
   - Classifier: SdcaMaximumEntropy to predict up to 20 base topics (tech, legal, finance, personal, health, travel, projects, code, credentials, etc.). Output top-k with confidences.
   - Create a “SensitivityScore” regressor (FastTree) trained on features + secret/pii hits; map to Level 0–3 via thresholds.
   - Provide CLI: `dotnet run -- train --data ./data/labelled/*.csv` to (re)train with user feedback.
4) Embeddings: add vector retrieval using Redis Vector or Qdrant (choose one via env VECTOR_BACKEND={{ redis|qdrant }}).
   - Embedding source: nomic-embed-text via Ollama or OpenAI text-embedding-3-small; store 768–1024D vectors.
   - Hybrid search: BM25 ∪ Top-k Vector → Cross-encoder rerank (optional later).

C. Redaction + gates
1) Sensitivity policy:
   - 0 Public, 1 Internal, 2 Confidential, 3 Secret.
   - Levels ≥2 are redacted by default in UI; reveal requires voice PIN flow (PIN stored argon2id).
2) /redact/preview {noteId, policy} returns masked text plus spans metadata.

D. API
1) POST /classify/{noteId} → {tags[], sensitivity, pii, secrets, summary}
2) POST /tags/bulk { ids[], add[], remove[] }
3) POST /embed/reindex { scope:"all|note|since", noteId?, since? }
4) GET /search/semantic?q=&k=&filters=  (returns chunks with highlights + sensitivity)

E. UI
1) Autotag panel with confidence chips; “Apply All” → bulk endpoint.
2) Sensitivity banner with color codes; toggle “Reveal” → voice PIN dialog.
3) Search: toggle BM25 vs Semantic, and filters (tags, sensitivity, time).

F. Background jobs
1) Redis Streams “ingest”, “classify”, “embed”. Worker service runs batches with backoff.
2) Idempotency on note hash. Errors logged to /data/logs with correlationId.

G. Tests + Output
1) Unit tests for ML.NET pipelines (save/load model .zip).
2) E2E test: ingest 1 000 files → classify + embed in <30 min on CPU.
3) Export/Import of metadata to JSON with versioning.
