/**
 * Single chat message row with lazy-loaded syntax highlighter.
 */
import React, { Suspense, lazy, useMemo, type ReactNode } from 'react';
import { Button } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import type { Artifact, RagSource, TokenUsage, ToolTraceEntry } from '../../types/api';
import ToolCallCard from './ToolCallCard';
import ConfirmActionCard from './ConfirmActionCard';
import { parseArtifacts } from '../../utils/artifactParser';
import { copyTextWithToast } from '../../utils/clipboard';
import { MessageSources } from './MessageSources';
import { markdownComponents } from './markdownComponents';

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
    copyTextWithToast(codeString, 'Код скопійовано! 📋');
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
          <span aria-hidden="true">📋</span> Copy
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
  sources?: RagSource[];
  tokenUsage?: TokenUsage;
  token_usage?: TokenUsage;
  tool_trace?: ToolTraceEntry[];
  toolTrace?: ToolTraceEntry[];
  parent_id?: number;
  branches?: Array<{ id: string | number; content: string; created_at?: string }>;
  branch_index?: number;
};

export type MessageItemProps = {
  msg: ChatMessageView;
  idx: number;
  speakingIdx: number | null;
  onSpeak: (content: string, idx: number) => void;
  onCopy: (content: string) => void;
  onRegenerate?: (assistantIdx: number) => void;
  onSwitchBranch?: (assistantIdx: number, branchIdx: number) => void;
  onOpenArtifact?: (artifact: Artifact) => void;
  streaming?: boolean;
  announce?: boolean;
};

const MessageItem = React.memo(function MessageItem({
  msg,
  idx,
  speakingIdx,
  onSpeak,
  onCopy,
  onRegenerate,
  onSwitchBranch,
  onOpenArtifact,
  streaming = false,
  announce = false,
}: MessageItemProps) {
  const components = useMemo(
    () => ({ ...markdownComponents, code: CodeBlock }),
    []
  );
  const artifactScope = msg.id != null ? String(msg.id) : `m${idx}`;
  const artifacts = useMemo(
    () => (msg.role === 'assistant' ? parseArtifacts(msg.content, artifactScope) : []),
    [artifactScope, msg.role, msg.content]
  );
  const branchCount = msg.branches?.length ?? 0;
  const branchIndex = msg.branch_index ?? 0;
  const [showTokens, setShowTokens] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    return window.localStorage.getItem('llm_assistant_show_tokens') !== 'false';
  });

  React.useEffect(() => {
    const handleStorage = () => {
      if (typeof window === 'undefined' || !window.localStorage) return;
      setShowTokens(window.localStorage.getItem('llm_assistant_show_tokens') !== 'false');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const usage = msg.tokenUsage || msg.token_usage;

  return (
    <div className={`message-bubble ${msg.role}`} aria-live={announce ? 'polite' : undefined}>
      <div className="message-header d-flex justify-content-between align-items-center">
        <span>{msg.role === 'user' ? '👤 Ви' : '🤖 Assistant'}</span>
        <div className="d-flex align-items-center gap-2">
          {msg.role === 'assistant' && branchCount > 1 && onSwitchBranch && (
            <span className="d-flex align-items-center gap-1 small text-muted">
              <Button
                variant="link"
                size="sm"
                className="p-0 text-muted text-decoration-none"
                disabled={branchIndex <= 0 || streaming}
                onClick={() => onSwitchBranch(idx, branchIndex - 1)}
                title="Попередня версія"
                aria-label="Попередня версія"
              >
                <span aria-hidden="true">◀</span>
              </Button>
              <span>
                {branchIndex + 1}/{branchCount}
              </span>
              <Button
                variant="link"
                size="sm"
                className="p-0 text-muted text-decoration-none"
                disabled={branchIndex >= branchCount - 1 || streaming}
                onClick={() => onSwitchBranch(idx, branchIndex + 1)}
                title="Наступна версія"
                aria-label="Наступна версія"
              >
                <span aria-hidden="true">▶</span>
              </Button>
            </span>
          )}
          {msg.role === 'assistant' && onRegenerate && (
            <Button
              variant="link"
              size="sm"
              className="p-0 text-muted text-decoration-none"
              onClick={() => onRegenerate(idx)}
              disabled={streaming}
              title="Перегенерувати відповідь"
              aria-label="Перегенерувати відповідь"
            >
              <span aria-hidden="true">🔄</span>
            </Button>
          )}
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
              aria-label={speakingIdx === idx ? 'Зупинити озвучку' : 'Озвучити голосом'}
            >
              <span aria-hidden="true">{speakingIdx === idx ? '🔊' : '🔊'}</span>
              {speakingIdx === idx ? ' (грає...)' : null}
            </Button>
          )}
          <Button
            variant="link"
            size="sm"
            className="p-0 text-muted text-decoration-none ms-1"
            onClick={() => onCopy(msg.content)}
            title="Копіювати повідомлення"
            aria-label="Копіювати повідомлення"
          >
            <span aria-hidden="true">📋</span>
          </Button>
        </div>
      </div>
      <div className="markdown-content">
        {msg.role === 'assistant' && (msg.tool_trace || msg.toolTrace)?.length ? (
          <div className="tool-trace-container mb-2">
            {(msg.tool_trace || msg.toolTrace)!.map((trace, traceIdx) => {
              const isConfirm =
                trace.requiresConfirmation ||
                trace.status === 'pending_confirmation' ||
                trace.category === 'write';

              if (isConfirm) {
                return (
                  <ConfirmActionCard
                    key={trace.pendingActionId || traceIdx}
                    toolTrace={trace}
                  />
                );
              }
              return (
                <ToolCallCard
                  key={traceIdx}
                  toolTrace={trace}
                />
              );
            })}
          </div>
        ) : null}
        <ReactMarkdown components={components}>{msg.content}</ReactMarkdown>
        {msg.role === 'assistant' && msg.sources?.length ? (
          <MessageSources sources={msg.sources} />
        ) : null}
        {msg.role === 'assistant' && artifacts.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mt-2">
            {artifacts.map((art) => (
              <Button
                key={art.id}
                variant="outline-info"
                size="sm"
                className="d-inline-flex align-items-center gap-1 py-1 px-2"
                onClick={() => onOpenArtifact?.(art)}
              >
                <span aria-hidden="true">🎨</span>
                <span>Переглянути артефакт: {art.title}</span>
              </Button>
            ))}
          </div>
        )}
        {msg.role === 'assistant' && showTokens && usage && (
          <div
            className="d-inline-flex align-items-center gap-1 text-muted small mt-1 px-2 py-0 border rounded border-secondary"
            style={{ fontSize: '0.75rem', opacity: 0.8 }}
            title={`Вхідні: ${usage.promptTokens} | Вихідні: ${usage.completionTokens}`}
          >
            <span>{usage.totalTokens.toLocaleString()} токенів</span>
            {usage.estimatedCostUsd !== undefined && usage.estimatedCostUsd > 0 && (
              <>
                <span>•</span>
                <span>
                  ~${usage.estimatedCostUsd < 0.01
                    ? usage.estimatedCostUsd.toFixed(4)
                    : usage.estimatedCostUsd.toFixed(3)}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export { CodeBlock };
export default MessageItem;
