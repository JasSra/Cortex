'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import ModernChatInterface from '../chat/ModernChatInterface'

interface ChatConversationPageProps {
  conversationId: string
}

export default function ChatConversationPage({ conversationId }: ChatConversationPageProps) {
  const router = useRouter()

  return (
    <div className="h-full">
      <ModernChatInterface 
        conversationId={conversationId}
      />
    </div>
  )
}
