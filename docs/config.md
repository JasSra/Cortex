# Unified Configuration Guide

This document standardizes configuration keys across Stage-1 to Stage-3.

## Embeddings

- Embedding:Provider = "openai" | "local"
- Embedding:Model = `text-embedding-3-small`
- Embedding:Dim = `int`  # vector dimensionality used by index creation

## Vector Store

- Vector:Backend = "redis" | "qdrant" | "neo4j"  # default: redis

## Graph Store

- Graph:Backend = "postgres" | "neo4j"  # default: postgres

## Policy & Routing

- Policy:ModelPolicy = "local_only" | "allow_openai"  # default: allow_openai
- Policy:ExternalModelAllowedForLevels = [0,1]

## Feature Flags

- FeatureFlags:AdaptiveCards = true
- FeatureFlags:ShareLinks = true
- FeatureFlags:ConfirmDelete = true

## Redis Keys & Streams

- Keys: chunk:{id}, embed:{chunkId}
- Streams (Redis Streams + consumer groups):
  - stream:ingest
  - stream:classify
  - stream:embed

## API Endpoints (normalized)

- POST /search { q, k, filters, mode:"hybrid|semantic|bm25", alpha }  # default mode=hybrid, alpha=0.6
- POST /admin/embed/reindex { scope:"all|note|since", noteId?, since? }  (alias: /embed/reindex)
- POST /admin/embed/reembed { scope:"all|note|since", noteId?, since? }

Aliases retained for backward compatibility but new documentation and clients should use the normalized forms.
