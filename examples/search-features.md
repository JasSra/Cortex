# Search and Discovery Features

## Full-Text Search
The system implements BM25 ranking over document chunks, providing relevance-based results for user queries.

## Filters and Facets
Users can filter results by:
- File type (.md, .txt, .pdf, .docx)
- Creation date range
- Document tags (future enhancement)

## Voice Commands
Natural language voice commands enable hands-free interaction:
- "Search for machine learning papers"
- "List recent documents"
- "Find notes about API design"

## Chunking Strategy
Documents are split into semantic chunks of 800-1200 tokens, respecting sentence boundaries for better search relevance.

## Future Enhancements
- Semantic search using vector embeddings
- Auto-tagging with ML models
- Cross-document linking and references
