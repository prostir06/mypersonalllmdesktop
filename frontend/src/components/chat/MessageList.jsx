/**
 * @file components/chat/MessageList.js
 * Список повідомлень чату з підтримкою стрімінгу та typing-indicator.
 * Вилучений з ChatBoxOptimized.js для кращої читабельності та підтримки.
 */

import React from 'react';
import { Spinner, Badge } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import MessageItem from './MessageItem';
import { CodeBlock } from './MessageItem';

const MessageList = React.memo(({
  messages,
  loading,
  streaming,
  streamedText,
  speakingIdx,
  onSpeak,
  onCopy,
  messagesEndRef,
}) => {
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
          <p>Введіть запитання нижче або оберіть роль AI, щоб розпочати діалог.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-list flex-grow-1 mb-3">
      {messages.map((msg, idx) => (
        <MessageItem
          key={`${msg.id || idx}-${msg.role}`}
          msg={msg}
          idx={idx}
          speakingIdx={speakingIdx}
          onSpeak={onSpeak}
          onCopy={onCopy}
        />
      ))}

      {streaming && (
        <div className="message-bubble assistant">
          <div className="message-header">
            <span>🤖 Assistant</span>
            <Badge bg="primary" className="ms-2">генерація...</Badge>
          </div>
          <div className="markdown-content">
            {streamedText ? (
              <ReactMarkdown components={{ code: CodeBlock }}>
                {streamedText}
              </ReactMarkdown>
            ) : (
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
});

MessageList.displayName = 'MessageList';

export default MessageList;
