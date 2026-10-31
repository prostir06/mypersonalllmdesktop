import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button } from 'react-bootstrap';
import type { Artifact } from '../../types/api';
import { copyTextWithToast } from '../../utils/clipboard';
import { downloadTextFile } from '../../hooks/useChatExport';

export interface ArtifactPanelProps {
  artifact: Artifact;
  onClose: () => void;
}

export function buildSafeSrcDoc(artifact: Artifact): string {
  if (artifact.type === 'svg') {
    return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #ffffff;
      overflow: auto;
    }
    svg {
      max-width: 95%;
      max-height: 95%;
      height: auto;
    }
  </style>
</head>
<body>
  ${artifact.content}
</body>
</html>`;
  }

  const isFullDocument =
    /<html\b/i.test(artifact.content) || /<!doctype\b/i.test(artifact.content);

  if (isFullDocument) {
    return artifact.content;
  }

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 1rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      color: #212529;
      background-color: #ffffff;
    }
  </style>
</head>
<body>
  ${artifact.content}
</body>
</html>`;
}

export default function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const safeDoc = useMemo(() => buildSafeSrcDoc(artifact), [artifact]);

  // Isolated /artifact-sandbox.html avoids inheriting parent's strict script-src 'self' CSP.
  const sendArtifactToSandbox = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'ARTIFACT_RENDER', html: safeDoc }, '*');
  }, [safeDoc]);

  useEffect(() => {
    if (activeTab !== 'preview') return;
    const handleMessage = (event: MessageEvent) => {
      if (
        event.source === iframeRef.current?.contentWindow &&
        event.data?.type === 'ARTIFACT_SANDBOX_READY'
      ) {
        sendArtifactToSandbox();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeTab, sendArtifactToSandbox]);

  const lineCount = useMemo(
    () => artifact.content.split('\n').length,
    [artifact.content]
  );

  const handleCopy = () => {
    copyTextWithToast(artifact.content, 'Код скопійовано в буфер');
  };

  const handleDownload = () => {
    const extension = artifact.type === 'svg' ? 'svg' : 'html';
    const mimeType =
      artifact.type === 'svg'
        ? 'image/svg+xml;charset=utf-8'
        : 'text/html;charset=utf-8';
    const safeTitle =
      artifact.title
        .toLowerCase()
        .trim()
        .replace(/[^\w\u0400-\u04FF-]+/gi, '_')
        .replace(/^_+|_+$/g, '') || 'artifact';
    downloadTextFile(artifact.content, `${safeTitle}.${extension}`, mimeType);
  };

  const containerClasses = isFullscreen
    ? 'artifact-panel card bg-dark text-light border-secondary shadow-lg position-fixed top-0 start-0 w-100 h-100 m-0 rounded-0'
    : 'artifact-panel card bg-dark text-light border-secondary shadow-sm h-100 rounded';

  const containerStyle: React.CSSProperties = isFullscreen
    ? { zIndex: 1050 }
    : {};

  const contentMinHeight = isFullscreen ? 'calc(100vh - 120px)' : '420px';

  return (
    <div
      data-testid="artifact-panel"
      className={containerClasses}
      style={containerStyle}
    >
      {/* Header */}
      <div className="card-header bg-dark border-bottom border-secondary d-flex flex-wrap align-items-center justify-content-between p-2 gap-2">
        <div className="d-flex align-items-center gap-2 overflow-hidden me-auto">
          <Badge bg="primary" className="text-uppercase px-2 py-1">
            {artifact.type.toUpperCase()}
          </Badge>
          <h6 className="mb-0 text-truncate text-light fw-semibold">
            {artifact.title}
          </h6>
        </div>

        <div className="d-flex align-items-center gap-1">
          <Button
            variant="outline-light"
            size="sm"
            onClick={handleCopy}
            aria-label="Копіювати"
            title="Копіювати код"
            className="d-inline-flex align-items-center gap-1 py-1 px-2"
          >
            <span>📋</span>
            <span className="d-none d-md-inline">Копіювати</span>
          </Button>

          <Button
            variant="outline-light"
            size="sm"
            onClick={handleDownload}
            aria-label="Завантажити"
            title="Завантажити файл"
            className="d-inline-flex align-items-center gap-1 py-1 px-2"
          >
            <span>⬇️</span>
            <span className="d-none d-md-inline">Завантажити</span>
          </Button>

          <Button
            variant="outline-light"
            size="sm"
            onClick={() => setIsFullscreen((prev) => !prev)}
            aria-label={isFullscreen ? 'Згорнути' : 'На весь екран'}
            title={isFullscreen ? 'Згорнути' : 'На весь екран'}
            className="d-inline-flex align-items-center gap-1 py-1 px-2"
          >
            <span>{isFullscreen ? '🗗' : '⛶'}</span>
            <span className="d-none d-md-inline">
              {isFullscreen ? 'Згорнути' : 'На весь екран'}
            </span>
          </Button>

          <Button
            variant="outline-secondary"
            size="sm"
            onClick={onClose}
            aria-label="Закрити"
            title="Закрити"
            className="py-1 px-2 text-light"
          >
            ✕
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="d-flex align-items-center gap-1 border-bottom border-secondary px-3 py-2 bg-dark">
        <button
          type="button"
          className={`btn btn-sm ${
            activeTab === 'preview'
              ? 'btn-secondary text-white fw-semibold'
              : 'btn-outline-secondary text-light'
          }`}
          onClick={() => setActiveTab('preview')}
          aria-pressed={activeTab === 'preview'}
        >
          👁️ Попередній перегляд
        </button>
        <button
          type="button"
          className={`btn btn-sm ${
            activeTab === 'code'
              ? 'btn-secondary text-white fw-semibold'
              : 'btn-outline-secondary text-light'
          }`}
          onClick={() => setActiveTab('code')}
          aria-pressed={activeTab === 'code'}
        >
          💻 Код
        </button>
      </div>

      {/* Body */}
      <div className="card-body p-2 d-flex flex-column flex-grow-1 overflow-hidden bg-dark">
        {activeTab === 'preview' ? (
          <div
            className="w-100 flex-grow-1 rounded overflow-hidden d-flex flex-column"
            style={{ minHeight: contentMinHeight }}
          >
            <iframe
              key={`${artifact.id}-${artifact.type}-${artifact.content.length}`}
              ref={iframeRef}
              data-testid="artifact-iframe"
              title={artifact.title}
              sandbox="allow-scripts"
              src="/artifact-sandbox.html"
              onLoad={sendArtifactToSandbox}
              className="w-100 h-100 border-0 bg-white rounded flex-grow-1"
              style={{ minHeight: contentMinHeight }}
            />
          </div>
        ) : (
          <div
            className="w-100 flex-grow-1 overflow-auto rounded bg-black p-3 border border-secondary"
            style={{ minHeight: contentMinHeight }}
          >
            <div className="text-secondary small mb-2 d-flex justify-content-between align-items-center">
              <span>
                {lineCount} {lineCount === 1 ? 'рядок' : 'рядків'}
              </span>
              <span className="text-uppercase">
                {artifact.language || artifact.type}
              </span>
            </div>
            <pre
              className="m-0 text-light"
              style={{
                fontFamily:
                  'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <code data-testid="artifact-raw-code">{artifact.content}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
