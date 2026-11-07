/**
 * Chat message list with streaming bubble and typing indicator.
 * Tokens stay in the streaming bubble until the turn commits them.
 */
import React from 'react';
import { Spinner, Badge } from 'react-bootstrap';
import type { Artifact } from '../../types/api';
import VirtualFrame from '../VirtualFrame';
import MessageItem, { type ChatMessageView } from './MessageItem';
import StreamingMarkdown from './StreamingMarkdown';

export type MessageListProps = {
  messages: ChatMessageView[];
  loading: boolean;
  streaming: boolean;
  streamedText: string;
  speakingIdx: number | null;
  onSpeak: (content: string, idx: number) => void;
  onCopy: (content: string) => void;
  onRegenerate?: (assistantIdx: number) => void;
  onSwitchBranch?: (assistantIdx: number, branchIdx: number) => void;
  onOpenArtifact?: (artifact: Artifact) => void;
};

function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="message-bubble assistant">
      <div className="message-header">
        <span>🤖 Assistant</span>
        <Badge bg="primary" className="ms-2">
          генерація...
        </Badge>
      </div>
      <div className="markdown-content">
        {text ? <StreamingMarkdown text={text} /> : <div className="typing-indicator" />}
      </div>
    </div>
  );
}

const MessageList = React.memo(function MessageList({
  messages,
  loading,
  streaming,
  streamedText,
  speakingIdx,
  onSpeak,
  onCopy,
  onRegenerate,
  onSwitchBranch,
  onOpenArtifact,
}: MessageListProps) {
  if (loading && messages.length === 0) {
    return (
      <div className="messages-list flex-grow-1 mb-3 d-flex align-items-center justify-content-center">
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
          <p className="text-muted mt-2">Завантаження розмови...</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0 && !streaming) {
    return (
      <div className="messages-list flex-grow-1 mb-3 d-flex align-items-center justify-content-center">
        <div className="text-center py-5 text-muted">
          <h4>👋 Ласкаво просимо!</h4>
          <p>
            Введіть запитання нижче, оберіть модель або додайте документи, щоб
            розпочати діалог.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-list flex-grow-1 mb-3">
      <VirtualFrame
        data={messages}
        alignToBottom
        initialTopMostItemIndex={Math.max(0, messages.length - 1)}
        followOutput={(atBottom) => (atBottom ? 'auto' : false)}
        itemContent={(idx, msg) => (
          <MessageItem
            msg={msg}
            idx={idx}
            speakingIdx={speakingIdx}
            onSpeak={onSpeak}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onSwitchBranch={onSwitchBranch}
            onOpenArtifact={onOpenArtifact}
            streaming={streaming}
          />
        )}
        components={{
          Footer: () => (streaming ? <StreamingBubble text={streamedText} /> : null),
        }}
      />
    </div>
  );
});

MessageList.displayName = 'MessageList';

export default MessageList;
