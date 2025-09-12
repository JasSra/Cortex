# Dynamic Routes Implementation

This document explains the dynamic routing implementation for Cortex application.

## Implemented Dynamic Routes

### 1. Workspace Notes: `/workspace/notes/[noteId]`
- **Purpose**: View and edit specific notes in the workspace
- **Component**: `WorkspaceNotePage` (wraps `WorkspaceEditor`)
- **Navigation**: Clicking on a note in the workspace sidebar navigates to this route
- **Back Navigation**: Uses router to navigate back to `/workspace`

### 2. Chat Conversations: `/chat/[conversationId]`
- **Purpose**: View specific chat conversation threads
- **Component**: `ChatConversationPage` (wraps `ModernChatInterface`)
- **Navigation**: Can be used for persisting and sharing chat conversations

### 3. Workspace Catch-All: `/workspace/[...slug]`
- **Purpose**: Handles invalid workspace subroutes and redirects to main workspace
- **Behavior**: Automatically redirects to `/workspace` for any unmatched paths

## Usage Examples

### Programmatic Navigation

```typescript
import { useRouter } from 'next/navigation'
import { getWorkspaceNoteUrl, getChatConversationUrl } from '@/lib/routeUtils'

const router = useRouter()

// Navigate to specific note
router.push(getWorkspaceNoteUrl('note-123'))
// Result: /workspace/notes/note-123

// Navigate to specific chat conversation
router.push(getChatConversationUrl('conv-456'))
// Result: /chat/conv-456
```

### Route Detection

```typescript
import { isWorkspaceNoteRoute, extractNoteIdFromRoute } from '@/lib/routeUtils'
import { usePathname } from 'next/navigation'

const pathname = usePathname()

if (isWorkspaceNoteRoute(pathname)) {
  const noteId = extractNoteIdFromRoute(pathname)
  console.log('Viewing note:', noteId)
}
```

## File Structure

```
src/app/
├── workspace/
│   ├── page.tsx                    # Main workspace view
│   ├── notes/
│   │   └── [noteId]/
│   │       └── page.tsx           # Dynamic note route
│   └── [...slug]/
│       └── page.tsx               # Catch-all redirect
└── chat/
    ├── page.tsx                   # Main chat view
    └── [conversationId]/
        └── page.tsx               # Dynamic conversation route

src/components/
├── workspace/
│   └── WorkspaceNotePage.tsx      # Note page wrapper component
└── pages/
    └── ChatConversationPage.tsx   # Chat conversation wrapper

src/lib/
└── routeUtils.ts                  # Route utility functions
```

## Integration Points

### Navigation in Sidebar
- `WorkspaceSidebar` now uses router navigation when notes are selected
- Note selection triggers navigation to `/workspace/notes/[noteId]`

### Active Route Detection
- `ModernLayout` properly detects when dynamic routes are active
- Workspace notes show "workspace" as active in navigation
- Chat conversations show "chat" as active in navigation

### URL Structure Benefits
- **Bookmarkable URLs**: Users can bookmark specific notes and conversations
- **Browser History**: Back/forward buttons work correctly
- **Deep Linking**: Direct access to specific content via URL
- **SEO Friendly**: Each note/conversation has its own URL

## Future Enhancements

These routes can be extended to support:
- Query parameters for search within notes
- Hash fragments for specific sections
- Additional nested routes (e.g., `/workspace/notes/[noteId]/edit`)
- Version history routes (e.g., `/workspace/notes/[noteId]/versions/[versionId]`)
