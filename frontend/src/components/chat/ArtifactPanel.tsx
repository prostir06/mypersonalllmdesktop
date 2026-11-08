import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button } from 'react-bootstrap';
import type { Artifact } from '../../types/api';
import { toast } from 'react-toastify';
import { copyTextWithToast } from '../../utils/clipboard';
import { downloadTextFile } from '../../hooks/useChatExport';
import { injectArtifactGuard } from './artifactGuard';
import { downloadArtifactAsDocx } from '../../utils/docxExport';
import ReactMarkdown from 'react-markdown';
import '../../styles/chat/_chat-layout.css';

export interface ArtifactPanelProps {
  artifact: Artifact;
  onClose: () => void;
}

export function buildSafeSrcDoc(artifact: Artifact): string {
  if (artifact.type === 'svg') {
    return injectArtifactGuard(`<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>*, *::before, *::after { box-sizing: border-box; } html, body { margin: 0; padding: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #ffffff; overflow: auto; } svg { max-width: 95%; max-height: 95%; height: auto; }</style>
</head><body>${artifact.content}</body></html>`);
  }

  const isFullDocument =
    /<html\b/i.test(artifact.content) || /<!doctype\b/i.test(artifact.content);

  if (isFullDocument) {
    return injectArtifactGuard(artifact.content);
  }

  return injectArtifactGuard(`<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>*, *::before, *::after { box-sizing: border-box; } body { margin: 0; padding: 1rem; font-family: Inter, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.5; color: #212529; background-color: #ffffff; }</style>
</head><body>${artifact.content}</body></html>`);
}

export default function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'edit' | 'code'>('preview');
  const [editedContent, setEditedContent] = useState<string>(artifact.content ?? '');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [prevId, setPrevId] = useState<string>(artifact.id);
  const [prevContent, setPrevContent] = useState<string>(artifact.content ?? '');
  const [exportingDocx, setExportingDocx] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Sync state during render when artifact id changes or content streams (standard React pattern)
  if (prevId !== artifact.id) {
    setPrevId(artifact.id);
    setEditedContent(artifact.content ?? '');
    setPrevContent(artifact.content ?? '');
    setIsDirty(false);
  } else if (!isDirty && prevContent !== artifact.content) {
    setPrevContent(artifact.content ?? '');
    setEditedContent(artifact.content ?? '');
  }

  const effectiveTab =
    artifact.type === 'svg' && activeTab === 'edit' ? 'preview' : activeTab;

  const safeDoc = useMemo(
    () => buildSafeSrcDoc({ ...artifact, content: editedContent }),
    [artifact, editedContent]
  );

  // Isolated /artifact-sandbox.html avoids inheriting parent's strict script-src 'self' CSP.
  const sendArtifactToSandbox = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'ARTIFACT_RENDER', html: safeDoc }, '*');
  }, [safeDoc]);

  useEffect(() => {
    if (effectiveTab !== 'preview' || artifact.type === 'docx') return;
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'ARTIFACT_SANDBOX_READY') {
        sendArtifactToSandbox();
      }
      if (event.data?.type === 'ARTIFACT_NAV_BLOCKED') {
        toast.info('Перехід з артефакта заблоковано');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [effectiveTab, artifact.type, sendArtifactToSandbox]);

  useEffect(() => {
    if (effectiveTab === 'preview' && artifact.type !== 'docx') {
      sendArtifactToSandbox();
    }
  }, [effectiveTab, artifact.type, sendArtifactToSandbox]);

  const lineCount = useMemo(
    () => editedContent.split('\n').length,
    [editedContent]
  );

  const handleCopy = () => {
    copyTextWithToast(editedContent, 'Код скопійовано в буфер');
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
    downloadTextFile(editedContent, `${safeTitle}.${extension}`, mimeType);
  };

  const handleExportDocx = async () => {
    try {
      setExportingDocx(true);
      await downloadArtifactAsDocx(editedContent, artifact.title);
    } catch (err) {
      toast.error('Не вдалося експортувати документ у .docx');
      console.error('Docx export failed:', err);
    } finally {
      setExportingDocx(false);
    }
  };

  const handleResetEdit = () => {
    setEditedContent(artifact.content ?? '');
    setIsDirty(false);
  };

  const containerClasses = isFullscreen
    ? 'artifact-panel card bg-dark text-light border-secondary shadow-lg position-fixed top-0 start-0 w-100 h-100 m-0 rounded-0'
    : 'artifact-panel card bg-dark text-light border-secondary shadow-sm h-100 rounded';

  const contentMinHeight = isFullscreen ? 'calc(100dvh - 120px)' : '420px';

  return (
    <div
      data-testid="artifact-panel"
      className={containerClasses}
      style={isFullscreen ? { zIndex: 1050 } : undefined}
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
            <span aria-hidden="true">📋</span>
            <span className="d-none d-md-inline">Копіювати</span>
          </Button>

          {artifact.type === 'docx' ? (
            <Button
              variant="outline-light"
              size="sm"
              onClick={handleExportDocx}
              disabled={exportingDocx}
              aria-label="Завантажити документ у форматі Word (.docx)"
              title="Завантажити документ у форматі Word (.docx)"
              className="d-inline-flex align-items-center gap-1 py-1 px-2"
            >
              <span aria-hidden="true">⬇️</span>
              <span className="d-none d-md-inline">
                {exportingDocx ? 'Експорт...' : '.docx'}
              </span>
            </Button>
          ) : (
            <>
              <Button
                variant="outline-light"
                size="sm"
                onClick={handleDownload}
                aria-label="Завантажити"
                title="Завантажити файл"
                className="d-inline-flex align-items-center gap-1 py-1 px-2"
              >
                <span aria-hidden="true">⬇️</span>
                <span className="d-none d-md-inline">Завантажити</span>
              </Button>

              {artifact.type === 'html' && (
                <Button
                  variant="outline-light"
                  size="sm"
                  onClick={handleExportDocx}
                  disabled={exportingDocx}
                  aria-label="Експорт у Word (.docx)"
                  title="Експорт у Word (.docx)"
                  className="d-inline-flex align-items-center gap-1 py-1 px-2"
                >
                  <span aria-hidden="true">📄</span>
                  <span className="d-none d-md-inline">
                    {exportingDocx ? 'Експорт...' : '.docx'}
                  </span>
                </Button>
              )}
            </>
          )}

          <Button
            variant="outline-light"
            size="sm"
            onClick={() => setIsFullscreen((prev) => !prev)}
            aria-label={isFullscreen ? 'Згорнути' : 'На весь екран'}
            title={isFullscreen ? 'Згорнути' : 'На весь екран'}
            className="d-inline-flex align-items-center gap-1 py-1 px-2"
          >
            <span aria-hidden="true">{isFullscreen ? '🗗' : '⛶'}</span>
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
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="d-flex align-items-center gap-1 border-bottom border-secondary px-3 py-2 bg-dark">
        <button
          type="button"
          className={`btn btn-sm ${
            effectiveTab === 'preview'
              ? 'btn-secondary text-white fw-semibold'
              : 'btn-outline-secondary text-light'
          }`}
          onClick={() => setActiveTab('preview')}
          aria-pressed={effectiveTab === 'preview'}
          aria-label="Попередній перегляд"
        >
          👁️ Перегляд
        </button>

        {(artifact.type === 'docx' || artifact.type === 'html') && (
          <button
            type="button"
            className={`btn btn-sm ${
              effectiveTab === 'edit'
                ? 'btn-secondary text-white fw-semibold'
                : 'btn-outline-secondary text-light'
            }`}
            onClick={() => setActiveTab('edit')}
            aria-pressed={effectiveTab === 'edit'}
            aria-label="Редагувати"
          >
            ✏️ Редагувати
          </button>
        )}

        <button
          type="button"
          className={`btn btn-sm ${
            effectiveTab === 'code'
              ? 'btn-secondary text-white fw-semibold'
              : 'btn-outline-secondary text-light'
          }`}
          onClick={() => setActiveTab('code')}
          aria-pressed={effectiveTab === 'code'}
          aria-label="Код"
        >
          💻 Код
        </button>
      </div>

      {/* Body */}
      <div className="card-body p-2 d-flex flex-column flex-grow-1 overflow-hidden bg-dark">
        {effectiveTab === 'preview' ? (
          artifact.type === 'docx' ? (
            <div
              className="artifact-docx-viewport"
              style={{ minHeight: contentMinHeight }}
            >
              <div
                className="artifact-docx-sheet"
                data-testid="artifact-docx-sheet"
              >
                <ReactMarkdown>{editedContent}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div
              className="w-100 flex-grow-1 rounded overflow-hidden d-flex flex-column"
              style={{ minHeight: contentMinHeight }}
            >
              <iframe
                key={`${artifact.id}-${artifact.type}-${editedContent.length}`}
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
          )
        ) : effectiveTab === 'edit' ? (
          <div
            className="w-100 flex-grow-1 d-flex flex-column rounded bg-dark p-2 border border-secondary"
            style={{ minHeight: contentMinHeight }}
          >
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-secondary small">
                {isDirty ? 'Є незбережені зміни' : 'Режим редагування'}
              </span>
              {isDirty && (
                <Button
                  variant="outline-warning"
                  size="sm"
                  onClick={handleResetEdit}
                  className="py-0 px-2 small"
                  aria-label="Скинути зміни"
                >
                  Скинути зміни
                </Button>
              )}
            </div>
            <textarea
              data-testid="artifact-editor-textarea"
              className="artifact-editor-textarea"
              value={editedContent}
              onChange={(e) => {
                setEditedContent(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Введіть вміст артефакта..."
              spellCheck={false}
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
              <code data-testid="artifact-raw-code">{editedContent}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
