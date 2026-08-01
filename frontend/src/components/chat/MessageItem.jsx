/**
 * @file components/chat/MessageItem.js
 * Окремий компонент для відображення одного повідомлення чату.
 * Використовує React.memo для запобігання зайвого перерендерингу.
 */

import React from 'react';
import { Button } from 'react-bootstrap';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toast } from 'react-toastify';

/** Компонент підсвічування синтаксису коду */
const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    toast.success('Код скопійовано! 📋', { autoClose: 1500 });
  };

  if (!inline && match) {
    return (
      <div style={{ position: 'relative' }}>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={handleCopy}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
            fontSize: '0.7rem',
            padding: '2px 8px'
          }}
        >
          📋 Copy
        </Button>
        <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" {...props}>
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code
      className={className}
      style={{
        background: 'rgba(99,102,241,0.15)',
        padding: '2px 6px',
        borderRadius: '4px',
        fontFamily: '"Fira Code", monospace',
        fontSize: '0.88em'
      }}
      {...props}
    >
      {children}
    </code>
  );
};

/**
 * MessageItem — один рядок чату (повідомлення користувача або AI).
 * Мемоізований для уникнення зайвого перерендерингу при стрімінгу.
 */
const MessageItem = React.memo(({ msg, idx, speakingIdx, onSpeak, onCopy }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, type: 'spring', stiffness: 200, damping: 20 }}
      layout
      className={`message-bubble ${msg.role}`}
    >
      <div className="message-header d-flex justify-content-between align-items-center">
        <span>{msg.role === 'user' ? '👤 Ви' : '🤖 Assistant'}</span>
        <div className="d-flex align-items-center gap-2">
          {msg.role === 'assistant' && (
            <Button
              variant="link"
              size="sm"
              className="p-0 text-muted text-decoration-none"
              onClick={() => onSpeak(msg.content, idx)}
              title={speakingIdx === idx ? 'Зупинити озвучку' : 'Озвучити голосом (TTS)'}
            >
              {speakingIdx === idx ? '🔊 (грає...)' : '🔊'}
            </Button>
          )}
          <Button
            variant="link"
            size="sm"
            className="p-0 text-muted text-decoration-none ms-1"
            onClick={() => onCopy(msg.content)}
            title="Копіювати повідомлення"
          >
            📋
          </Button>
        </div>
      </div>
      <div className="markdown-content">
        <ReactMarkdown components={{ code: CodeBlock }}>
          {msg.content}
        </ReactMarkdown>
      </div>
    </motion.div>
  );
});

MessageItem.displayName = 'MessageItem';

export { CodeBlock };
export default MessageItem;
