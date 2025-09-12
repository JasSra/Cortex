import ChatConversationPage from '@/components/pages/ChatConversationPage';

export default function ChatConversationDynamicPage({ params }: { params: { conversationId: string } }) {
  return <ChatConversationPage conversationId={params.conversationId} />;
}
