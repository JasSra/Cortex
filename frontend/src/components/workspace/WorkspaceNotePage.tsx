'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import WorkspaceEditor from './WorkspaceEditor'

interface WorkspaceNotePageProps {
  noteId: string
}

export default function WorkspaceNotePage({ noteId }: WorkspaceNotePageProps) {
  const router = useRouter()

  const handleBack = () => {
    router.push('/workspace')
  }

  return (
    <div className="h-full">
      <WorkspaceEditor 
        noteId={noteId}
        onBack={handleBack}
        isVisible={true}
      />
    </div>
  )
}
