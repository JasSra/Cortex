import { redirect } from 'next/navigation'

export default function WorkspaceCatchAll({ params }: { params: { slug: string[] } }) {
  // If we're trying to access a workspace route that doesn't exist,
  // redirect to the main workspace page
  redirect('/workspace')
}
