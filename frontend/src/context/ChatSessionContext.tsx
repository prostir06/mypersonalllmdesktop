import { createContext, useContext, type ReactNode } from 'react';
import type { useChatAttachments } from '../hooks/useChatAttachments';
import type { useChatDocuments } from '../hooks/useChatDocuments';
import type { useChatModelSelection } from '../hooks/useChatModelSelection';

export type ChatSessionValue = {
  documents: ReturnType<typeof useChatDocuments>;
  attachments: ReturnType<typeof useChatAttachments>;
  model: ReturnType<typeof useChatModelSelection>;
};

const ChatSessionContext = createContext<ChatSessionValue | null>(null);

export function ChatSessionProvider({
  value,
  children,
}: {
  value: ChatSessionValue;
  children: ReactNode;
}) {
  return (
    <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
  );
}

export function useChatSession(): ChatSessionValue | null {
  return useContext(ChatSessionContext);
}
