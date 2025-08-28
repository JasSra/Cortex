# P1 – Auth, Privacy, Governance & Hardening AI Prompt

Purpose: extend P0 to secure multi-user operation, governance, sharing, and quality. Maintain smooth upgrade with zero data loss. Placeholders use {{ PLACEHOLDER }}.

## 0) Objectives

1. Add AuthN/Z (OIDC/JWT) with row-level scoping by `userId`.
2. RBAC for agent tools and admin endpoints.
3. Governance: audit, retention, redaction, versioning, share links.
4. Quality & safety: confirmations for destructive ops, model routing policies, STT/TTS adapters.

## 1) Migration & Compatibility

1. Keep existing tables; add new tables non-destructively.
2. Background jobs: backfill `AuditEvent`, `Version` entries for existing notes.
3. Config flags default to secure values; feature flags allow staged rollout.

## 2) Security – AuthN

1. OIDC provider: {{ PLACEHOLDER\_IDP }}; accept RS256/ES256 JWT.
2. Middleware validates token; map `sub`→`UserId`; enforce `userId` filter on all queries.
3. API keys for system-to-system calls (scoped + expiring).

## 3) Security – AuthZ (RBAC)

1. Roles: `Reader`, `Editor`, `Admin`.
2. Policy matrix:

   * Reader: read/search/rag.
   * Editor: create/update/delete/tag/summarise.
   * Admin: reindex/reembed/system metrics/cards templates upload.
3. Per-tool permission check:

```csharp
public Permission RequiredPermission => Permission.WriteNotes; // example
```

## 4) Privacy & Governance

1. **AuditEvent**(Id, ActorId, Entity, EntityId, Action, Ts, Ip, MetaJson).
2. Log read events when content length > 500 chars; log all tool executions.
3. **Retention Policy Engine**: rule rows `(scope, condition, action)`; actions: redact, delete, notify.
4. **Redaction**: regex library + ML hints for PII (emails, phones, IDs). Store redacted view.
5. **Versioning**: NoteVersion(Id, NoteId, ParentVersionId, Diff, CreatedAt, ActorId). Endpoints: `GET /notes/{id}/versions`, `POST /notes/{id}/revert/{versionId}`.
6. **Scoped Share Links**: Token(Id, NoteId, Scope, ExpiresAt, CreatedBy). Endpoint: `POST /notes/{id}/share { scope, ttl_s }` → url.

## 5) Safety & Guardrails

1. Destructive actions (`DeleteNote`, `BulkDelete`, `Purge`) require **ConfirmDelete** adaptive card round-trip.
2. Dry-run mode for tools: `X-Tool-DryRun: true` header returns proposed effect without mutation.
3. Rate limits: per-user + per-tool; e.g., `DeleteNote` ≤ 5/min.
4. Idempotency persisted 24 h per user/action (table `IdempotencyKey`).

## 6) Model Routing & Data Control

1. Policy: LEVEL 0–3 data sensitivity attached to notes.
2. Routing rules: LEVEL ≥ 2 → local-only models; LEVEL < 2 → external allowed.
3. Config:
   * `Policy:ModelPolicy = "local_only"|"allow_openai"` (default `allow_openai`).
   * `Policy:ExternalModelAllowedForLevels = [0,1]`.

## 7) Multi‑Tenancy

1. Option A: single DB with row-level policy filter `TenantId` + Redis key prefix `t:{TenantId}:`.
2. Option B: schema-per-tenant for Postgres.
3. Tenant bootstrap API: `POST /admin/tenants` (Admin only).

## 8) Adaptive Cards – Governance

1. Template registry in DB or object storage.
2. Admin endpoints: `POST /cards/templates` (upload), `GET /cards/templates/{id}` (versioned), `POST /cards/render { templateId, model }`.
3. Validation against schema v1.6; lint unknown actions.

## 9) Quality – STT/TTS Abstractions

1. Interfaces `ISttProvider`, `ITtsProvider`; providers: {{ PLACEHOLDER\_STT }}, {{ PLACEHOLDER\_TTS }}.
2. Metrics: WER %, latency p50/p95; nightly evaluation over curated 2 h set.
3. Voice PIN (optional) to reveal notes at sensitivity ≥ 2 during voice sessions.

## 10) Observability & SLOs

1. OTEL + Prometheus dashboards for auth failures, policy decisions, tool errors.
2. SLOs: 99% CRUD < 200 ms, 99% search < 300 ms, 99% token render < 150 ms.
3. Alerts: queue depth > {{ PLACEHOLDER\_THRESHOLD }}, error rate > 1%/5 min, STT WER > {{ PLACEHOLDER\_WER }}%.

## 11) DevSecOps

1. Secrets from {{ PLACEHOLDER\_SECRET\_MANAGER }}; rotate keys every 90 d.
2. CI: SAST, dependency audit, container image scan; SBOM export.
3. Backups: DB daily, Redis RDB hourly; restore drills monthly.

## 12) API Additions (over P0)

1. `POST /auth/login` (if first‑party) or OIDC redirect flow.
2. `GET /me` returns roles/tenant.
3. `GET /notes/{id}/versions`, `POST /notes/{id}/revert/{versionId}`.
4. `POST /notes/{id}/share`, `DELETE /shares/{tokenId}`.
5. `POST /cards/templates`, `POST /cards/render`.
6. `GET /audit?filters=...`.
7. Search remains unified: `POST /search { q, filters, k, mode:"hybrid|semantic|bm25", alpha }`.
8. Reindex endpoints unified: `POST /admin/embed/reindex { scope, noteId?, since? }`, `POST /admin/embed/reembed { scope, noteId?, since? }` (aliases preserved).

## 13) Acceptance Criteria (DoD)

1. All P0 endpoints enforce user/tenant scoping.
2. RBAC prevents Editor‑ forbidden operations; unit tests per tool.
3. Audit covers reads and writes; export works (CSV/JSON).
4. Policies correctly route models by sensitivity; external calls blocked for high‑level data.
5. ConfirmDelete card required and enforced for destructive ops.
6. Share links work with scope & expiry; revocation effective within ≤ 10 s.

## 14) Rollout Plan

1. Phase 1: enable AuthN only; shadow‑log policy hits.
2. Phase 2: enforce RBAC + row‑filters; introduce ConfirmDelete.
3. Phase 3: enable retention/redaction; enable share links.
4. Phase 4: activate model routing by levels; enforce voice PIN.

## 15) Config

1. `Auth:Authority={{ PLACEHOLDER_IDP_URL }}`; `Auth:Audience={{ PLACEHOLDER_AUD }}`.
2. `Policy:RetentionRules=[{ "scope":"personal", "ageDays":365, "action":"redact" }]`.
3. `FeatureFlags:ShareLinks=true`, `FeatureFlags:ConfirmDelete=true`.

## 16) Backlog - Future Enhancements

**Non-critical items moved to future phases:**

1. ❌ **Audit logging implementation** - Move to Phase 3
   * Currently no audit logging implemented
   * Can be added after core RBAC is working
   * Lower priority than basic auth/authz

2. ❌ **RBAC enforcement in endpoints** - Move to Phase 2  
   * Basic UserContext exists but needs endpoint-level enforcement
   * Can start with middleware approach
   * Focus on core functionality first

3. ❌ **Retention/redaction policies** - Move to Phase 4
   * Complex feature requiring governance framework
   * Not needed for basic multi-user operation
   * Can be implemented after share links

4. ❌ **Share link functionality** - Move to Phase 3
   * Nice-to-have feature for collaboration
   * Not critical for core auth/authz
   * Requires token management infrastructure

**Current Focus**: Controller separation with proper context isolation

---

**Execute now**: separate controllers by context → implement basic auth middleware → add user scoping to queries → defer advanced governance features.
