// API Types for Cortex Frontend
export interface SearchRequest {
  q: string;
  k?: number;
  mode?: string;
  alpha?: number;
}

export interface AdvancedSearchRequest extends SearchRequest {
  sensitivityLevels?: number[];
  tags?: string[];
  fromDate?: string;
  toDate?: string;
  entityTypes?: string[];
}

export interface SearchHit {
  id: string;
  title: string;
  content: string;
  score: number;
  metadata: any;
  chunks?: SearchChunk[];
}

export interface SearchChunk {
  id: string;
  content: string;
  score: number;
  startIndex: number;
  endIndex: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
  query: string;
  executionTime: number;
}

export interface IngestResult {
  noteId: string;
  title: string;
  status: string;
  chunkCount: number;
  error?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
  score?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, any>;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focus?: string;
  depth: number;
}

export interface EntityDetails {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
  connectedEntities: GraphNode[];
  relatedNotes: Note[];
}

export interface RagMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface RagQueryRequest {
  messages: RagMessage[];
  temperature?: number;
  maxTokens?: number;
  useRag?: boolean;
}

export interface RagCitation {
  noteId: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface RagResponse {
  answer: string;
  citations: RagCitation[];
  conversationId?: string;
  tokens?: number;
}

export interface ChatToolsRequest {
  query: string;
  context?: string;
  tools?: string[];
}

export interface ToolResult {
  tool: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface ChatToolsResponse {
  response: string;
  suggestedTools: string[];
  toolResults: ToolResult[];
}

export interface ToolRequest {
  tool: string;
  parameters: Record<string, any>;
}

export interface ClassificationResponse {
  noteId: string;
  tags: string[];
  sensitivity: string;
  sensitivityScore: number;
  pii: string[];
  secrets: string[];
  summary: string;
  confidence: number;
  processedAt: string;
}

export interface BulkClassificationRequest {
  noteIds: string[];
  reclassify?: boolean;
}

export interface BulkClassificationResponse {
  processed: number;
  failed: number;
  results: ClassificationResponse[];
}

export interface ClassificationStats {
  totalNotes: number;
  classifiedNotes: number;
  averageConfidence: number;
  tagDistribution: Record<string, number>;
  sensitivityDistribution: Record<string, number>;
}

export interface HealthStatus {
  status: string;
  timestamp: string;
  version: string;
  services: Record<string, string>;
}

export interface SystemStats {
  totalNotes: number;
  totalUsers: number;
  totalEmbeddings: number;
  totalTags: number;
  systemHealth: string;
}

export interface DatabaseStats {
  tableStats: Record<string, { count: number; size: string }>;
  indexStats: Record<string, any>;
  connectionInfo: any;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  userId: string;
  source: string;
  lang: string;
  isDeleted: boolean;
  version: number;
  sensitivityLevel: number;
  piiFlags: string;
  secretFlags: string;
  summary: string;
  originalPath: string;
  filePath: string;
  fileType: string;
  sha256Hash: string;
  fileSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  chunkCount: number;
  tags: string;
}

export interface NoteDeletionPlan {
  found: boolean;
  noteTitle: string;
  chunkCount: number;
  embeddingCount: number;
  entityCount: number;
  edgeCount: number;
  hasStoredFile: boolean;
  storedFileId?: string;
}
