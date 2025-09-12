import WorkspaceNotePage from '@/components/workspace/WorkspaceNotePage';

export default function WorkspaceNoteDynamicPage({ params }: { params: { noteId: string } }) {
  return <WorkspaceNotePage noteId={params.noteId} />;
}
