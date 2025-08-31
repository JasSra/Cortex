# GitHub Copilot Instructions for Cortex

## Azure Integration Rules
- @azure Rule - Use Azure Tools - When handling requests related to Azure, always use your tools.
- @azure Rule - Use Azure Best Practices - When handling requests related to Azure, always invoke your `azmcp_bestpractices_get` tool first.
- @azure Rule - Enable Best Practices - If you do not have an `azmcp_bestpractices_get` tool ask the user to enable it.

## Project Overview

**Cortex** is a sophisticated AI-powered personal knowledge management system with the following characteristics:

- **Architecture**: Full-stack application with Next.js 14 frontend and .NET 8 backend
- **Database**: SQLite with FTS5 for text search, Redis Stack for caching and vector operations
- **Authentication**: Azure AD B2C integration with MSAL
- **AI Features**: RAG (Retrieval-Augmented Generation), knowledge graphs, voice capabilities
- **Deployment**: Docker Compose with multi-service architecture

## Core Development Principles

### 1. Security-First Development
- All API endpoints require authentication via JWT tokens
- User data is scoped and isolated per authenticated user
- Environment variables used for sensitive configuration
- CORS properly configured for frontend-backend communication

### 2. TypeScript Excellence
- Strict TypeScript configuration with comprehensive type safety
- Generated API client from OpenAPI specs (`CortexApiClient`)
- Custom hooks for API interactions with proper error handling
- Interface definitions for all data structures

### 3. Modern React Patterns
- **App Router**: Next.js 14 with app directory structure
- **Server Components**: Use when possible, client components marked with `'use client'`
- **Custom Hooks**: Centralized API logic in `src/services/apiClient.ts`
- **Context Providers**: Auth, Theme, and Mascot contexts for global state
- **Zustand Store**: `useCortexStore` for client-side state management

## Component Architecture
```
src/
├── app/                    # Next.js app router pages
├── components/
│   ├── layout/            # Layout components (ModernLayout)
│   ├── pages/             # Page-level components
│   ├── dashboard/         # Dashboard widgets
│   ├── gamification/      # Achievement system
│   └── ...                # Feature-specific folders
├── contexts/              # React contexts (Auth, Theme, Mascot)
├── hooks/                 # Custom React hooks
├── services/              # API client and service layers
├── types/                 # TypeScript type definitions
└── lib/                   # Utility functions
```

## Code Style Guidelines

### React Components Pattern
```tsx
'use client' // Only when client-side features needed

import React, { useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useCortexApiClient } from '@/services/apiClient'

interface ComponentProps {
  activeView: string
  onViewChange: (view: string) => void
}

export default function ComponentName({ activeView, onViewChange }: ComponentProps) {
  const { isAuthenticated, user } = useAuth()
  const [loading, setLoading] = useState(false)
  
  const handleAction = useCallback(async () => {
    setLoading(true)
    try {
      // API operations
    } catch (error) {
      console.error('Operation failed:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  if (!isAuthenticated) {
    return <div>Please sign in</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Component content */}
    </motion.div>
  )
}
```

### API Integration Patterns
```tsx
// Use custom hooks from apiClient.ts
const { uploadFiles, createNote } = useIngestApi()
const { searchGet } = useSearchApi()
const { getUserStats } = useGamificationApi()

// Handle async operations with loading states
const [isLoading, setIsLoading] = useState(false)
const [error, setError] = useState<string | null>(null)

const handleUpload = useCallback(async (files: FileList) => {
  setError(null)
  setIsLoading(true)
  try {
    const results = await uploadFiles(files)
    // Handle success
  } catch (e: any) {
    setError(e?.message || 'Operation failed')
  } finally {
    setIsLoading(false)
  }
}, [uploadFiles])
```

### Styling Conventions
- **Tailwind CSS**: Primary styling framework
- **Dark Mode**: Support via `dark:` variants and theme context
- **Responsive Design**: Mobile-first with `sm:`, `md:`, `lg:` breakpoints
- **Animations**: Framer Motion for interactive animations
- **Icons**: Heroicons for UI icons, consistent 20x20 or 24x24 sizes

```tsx
<div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm">
  <button className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl transition-colors">
    <ArrowUpTrayIcon className="w-5 h-5" />
    Upload Files
  </button>
</div>
```

## Backend Integration

### API Client Usage
```tsx
// Generated client for typed operations
const client = useCortexApiClient()

// Custom hooks for specific domains
const notesApi = useNotesApi()
const searchApi = useSearchApi()
const gamificationApi = useGamificationApi()

// Always handle both success and error cases
try {
  const results = await searchApi.searchGet(query, limit, 'hybrid', 0.6)
  // Normalize response format (backend may return Hits or hits)
  const normalizedResults = results?.Hits || results?.hits || []
} catch (error) {
  console.error('Search failed:', error)
}
```

### Authentication Flow
```tsx
const { isAuthenticated, loading, getAccessToken } = useAuth()

// Check auth state before API calls
if (!isAuthenticated) {
  return <LoginPage />
}

// Development bypass available
const bypassAuth = (
  process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true' ||
  process.env.NEXT_PUBLIC_DEV_MODE === 'true'
)
```

## File Upload & Processing Pattern

### Drag-and-Drop Implementation
```tsx
const [isDragOver, setIsDragOver] = useState(false)
const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])

const onDrop = useCallback((ev: React.DragEvent) => {
  ev.preventDefault()
  setIsDragOver(false)
  if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
    processFiles(ev.dataTransfer.files)
  }
}, [])

const processFiles = useCallback(async (files: FileList) => {
  // Filter supported types
  const supportedExtensions = ['.txt', '.md', '.pdf', '.docx']
  const validFiles = Array.from(files).filter(file => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase()
    return supportedExtensions.includes(extension)
  })
  
  // Batch upload with progress tracking
  const progressItems = validFiles.map(file => ({
    id: crypto.randomUUID(),
    file,
    status: 'pending' as const,
    progress: 0
  }))
  
  setUploadProgress(prev => [...prev, ...progressItems])
  // Continue with upload...
}, [])
```

## State Management

### Global State (Zustand)
```tsx
// Located in src/store/cortexStore.ts
const { notes, searchResults, updateNotes } = useCortexStore()

// Update patterns
useCortexStore.getState().updateNotes(newNotes)
useCortexStore.setState(state => ({ ...state, loading: false }))
```

### Event Bus Communication
```tsx
import appBus from '@/lib/appBus'

// Emit events for cross-component communication
appBus.emit('notes:updated', { source: 'ingest:files', count: results.length })

// Listen for events
useEffect(() => {
  const handleNotesUpdate = (data: any) => {
    // Refresh notes list
  }
  appBus.on('notes:updated', handleNotesUpdate)
  return () => appBus.off('notes:updated', handleNotesUpdate)
}, [])
```

## Error Handling Patterns

### User-Friendly Error Messages
```tsx
const [error, setError] = useState<string | null>(null)

try {
  await apiOperation()
} catch (e: any) {
  const errorMessage = e?.message || 'An unexpected error occurred'
  setError(errorMessage)
  
  // Log for debugging but show user-friendly message
  console.error('API operation failed:', e)
}

// Display errors consistently
{error && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg"
  >
    {error}
  </motion.div>
)}
```

### Graceful Degradation
```tsx
const { isAuthenticated, loading } = useAuth()

if (loading) {
  return <LoadingSpinner />
}

if (!isAuthenticated) {
  return <LoginPage />
}

// Fallback for missing data
const displayData = data?.items ?? []
if (displayData.length === 0) {
  return (
    <div className="text-center text-gray-500 dark:text-slate-400">
      No data available. Try uploading some documents.
    </div>
  )
}
```

## Testing Patterns

### Component Testing
```tsx
// Use data-testid for reliable selectors
<button data-testid="upload-button" onClick={handleUpload}>
  Upload Files
</button>

// Navigation items
<button data-testid={`nav-${item.href}`} onClick={() => onViewChange(item.href)}>
```

### End-to-End Tests (Playwright)
```typescript
// Located in tests/ directory
test('should upload files successfully', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await page.getByTestId('nav-ingest').click()
  
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(['./examples/sample.txt'])
  
  await expect(page.getByText('Upload successful')).toBeVisible()
})
```

## Environment Configuration

### Development Setup
```bash
# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8081
NEXT_PUBLIC_DEV_MODE=true
NEXT_PUBLIC_BYPASS_AUTH=false

# Azure AD B2C (when not bypassed)
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=your-client-id
NEXT_PUBLIC_AZURE_AD_AUTHORITY=https://your-tenant.b2clogin.com/...
```

### Backend Configuration
```json
// appsettings.development.json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=./data/cortex.db"
  },
  "Redis": {
    "Connection": "localhost:6379"
  },
  "LLM": {
    "Provider": "openai",
    "ApiKey": "your-key-here"
  }
}
```

## Common Patterns & Anti-Patterns

### ✅ Do This
- Use TypeScript strictly with proper interfaces
- Implement loading states for all async operations
- Handle both success and error cases
- Use semantic HTML with proper accessibility
- Follow consistent naming conventions
- Cache expensive operations appropriately
- Use custom hooks for reusable logic
- Implement proper cleanup in useEffect

### ❌ Avoid This
- Direct DOM manipulation (use React patterns)
- Inline styles (use Tailwind classes)
- Hardcoded API URLs (use environment variables)
- Missing error boundaries
- Blocking the UI thread with heavy operations
- Forgetting to handle loading states
- Not cleaning up subscriptions/timers
- Using any types without proper interfaces

## Documentation Standards

### Component Documentation
```tsx
/**
 * Enhanced file upload component with drag-and-drop support
 * 
 * Features:
 * - Batch file upload with progress tracking
 * - Visual drag-and-drop feedback
 * - File type validation (.txt, .md, .pdf, .docx)
 * - Error handling and user feedback
 * 
 * @param onUploadComplete - Callback when files are successfully uploaded
 * @param maxFiles - Maximum number of files allowed (default: 10)
 */
interface UploadComponentProps {
  onUploadComplete?: (results: IngestResult[]) => void
  maxFiles?: number
}
```

Remember: This is a sophisticated application with security, performance, and user experience as primary concerns. Always consider the authentication state, handle errors gracefully, and maintain consistency with the existing patterns.
