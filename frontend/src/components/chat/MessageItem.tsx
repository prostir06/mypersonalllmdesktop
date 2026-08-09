/**
 * Single chat message row with lazy-loaded syntax highlighter.
 */
import React, { Suspense, lazy, useMemo, type ReactNode } from 'react';
import { Button } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import { toast } from 'react-toastify';

const LazyHighlighter = lazy(() => import('./CodeHighlighter'));

type CodeBlockProps = {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
};

const CodeBlock = ({ inline, className, children, ...props }: CodeBlockProps) => {
  const match = /language-(\w+)/.exec(className || '');
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    void navigator.clipboard.writeText(codeString);
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
            padding: '2px 8px',
          }}
        >
          📋 Copy
        </Button>
        <Suspense
          fallback={
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{codeString}</pre>
          }
        >
          <LazyHighlighter language={match[1]} {...props}>
            {codeString}
          </LazyHighlighter>
        </Suspense>
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
        fontSize: '0.88em',
      }}
      {...props}
    >
      {children}
    </code>
  );
};

export type ChatMessageView = {
  id?: string | number;
  role: string;
  content: string;
};

export type MessageItemProps = {
  msg: ChatMessageView;
  idx: number;
  speakingIdx: number | null;
  onSpeak: (content: string, idx: number) => void;
  onCopy: (content: string) => void;
};

const MessageItem = React.memo(function MessageItem({
  msg,
  idx,
  speakingIdx,
  onSpeak,
  onCopy,
}: MessageItemProps) {
  const components = useMemo(() => ({ code: CodeBlock }), []);

  return (
    <div className={`message-bubble ${msg.role}`}>
      <div className="message-header d-flex justify-content-between align-items-center">
        <span>{msg.role === 'user' ? '👤 Ви' : '🤖 Assistant'}</span>
        <div className="d-flex align-items-center gap-2">
          {msg.role === 'assistant' && (
            <Button
              variant="link"
              size="sm"
              className="p-0 text-muted text-decoration-none"
              onClick={() => onSpeak(msg.content, idx)}
              title={
                speakingIdx === idx
                  ? 'Зупинити озвучку'
                  : 'Озвучити голосом (TTS)'
              }
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
        <ReactMarkdown components={components}>{msg.content}</ReactMarkdown>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export { CodeBlock };
export default MessageItem;
