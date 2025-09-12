/**
 * Utility functions for dynamic route navigation
 */

/**
 * Generate URL for a specific workspace note
 */
export function getWorkspaceNoteUrl(noteId: string): string {
  return `/workspace/notes/${noteId}`
}

/**
 * Generate URL for a specific chat conversation
 */
export function getChatConversationUrl(conversationId: string): string {
  return `/chat/${conversationId}`
}

/**
 * Check if current path is a workspace note route
 */
export function isWorkspaceNoteRoute(pathname: string): boolean {
  return pathname.startsWith('/workspace/notes/')
}

/**
 * Extract note ID from workspace note route
 */
export function extractNoteIdFromRoute(pathname: string): string | null {
  const match = pathname.match(/^\/workspace\/notes\/(.+)$/)
  return match ? match[1] : null
}

/**
 * Check if current path is a chat conversation route
 */
export function isChatConversationRoute(pathname: string): boolean {
  return pathname.startsWith('/chat/') && pathname !== '/chat'
}

/**
 * Extract conversation ID from chat conversation route
 */
export function extractConversationIdFromRoute(pathname: string): string | null {
  const match = pathname.match(/^\/chat\/(.+)$/)
  return match ? match[1] : null
}
