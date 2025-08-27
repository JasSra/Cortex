Build Stage-3 on top of Stage-2: entity graph, mind-map UI, RAG chat with tools, suggestions.

A. Entity + linking
1) NER: spaCy-like via .NET (use SciSharp/TensorFlow.NET ONNX NER or rule-based) to extract Persons, Orgs, Locations, Projects, IDs.
2) Canonicalization: string sim (Jaro-Winkler), embedding sim ≥0.8 → collapse to one Entity.
3) Relations:
   - same_topic, references, refines, contradicts.
   - Generate candidate edges via co-occurrence + sim; verify with LLM (“pairwise link prompt”) returning relation+confidence.
4) Store edges in Postgres (Edges table) or Neo4j if VECTOR_BACKEND=neo4j; expose /graph endpoints.

B. RAG assistant (tools)
1) Tool: search_hybrid(q,k,filters) → chunks (respect sensitivity gates; Level 3 local-only).
2) Tool: tag_apply(ids[],tags[]); tool: redact_preview(noteId,policy); tool: link_probe(entityA,entityB).
3) System prompt (NotePilot): be brief, numbered, enforce redaction policy, ask confirmation for bulk edits, return JSON for tool calls.
4) Chat flow:
   - User voice → STT → intent classify/search/summarise/retag/redact/export.
   - Retrieve top-k (hybrid) → build prompt with chunk summaries (not raw secrets).
   - Stream answer; if action suggested, emit tool JSON.

C. Mind-map UI
1) Cytoscape.js / React Flow scene:
   - Left: filters (time, tag, sensitivity, entity type).
   - Center: graph with clustering and expand-on-click.
   - Right: inspector: node details, top linked notes, actions (open, tag, redact, jump to chunk).
2) “What changed today”: diff of new nodes/edges/tags.

D. Suggestions engine
1) Daily digest generator: summarize new notes, new entities, possible duplicates, risky secrets found.
2) Rule examples:
   - If secret_flags contains “AWSAccessKey” → suggest: “Create vault item?”, “Redact here?”
   - If multiple notes mention {{ PROJECT_NAME }} → propose a collection with tags.

E. Security & privacy
1) Config: MODEL_POLICY={{ local_only|allow_openai }}; when local_only, block external model calls for Level≥2.
2) Voice PIN: required to reveal Level≥2 content or export raw.
3) Audit log of reveals and bulk edits.

F. API
1) GET /graph?focus=entity:{{ ID }}&depth=2  → nodes+edges+scores
2) POST /chat/tools  (LLM tool router; executes actions with confirmations)
3) GET /digest/today  → summary HTML/JSON
4) POST /export { scope, format:"zip|json", include_sensitive:false|true }

G. DX & Ops
1) Add CI workflow: build, test, lint; Docker build; compose smoke test.
2) Observability: minimal OTLP logs/metrics; request timing; background job metrics.
3) Performance targets:
   - Query (hybrid+k=20+ranker): p95 < 500 ms on CPU.
   - Mind-map render ≤ 2 s for 2 000 nodes.

H. Deliverables
1) Full code, migrations, seed, fixtures.
2) Demo script: “Ingest → Auto-classify → Ask: ‘Summarise Brisbane legal notes’ → Mind-map → Redact reveal via voice PIN → Export digest”.
3) Docs: architecture, threat model, policy tuning, model switch guide.
