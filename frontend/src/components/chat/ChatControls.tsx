/**
 * Chat toolbar: provider, model, temperature, prompts, RAG, export.
 */
import React, { type ChangeEvent, useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import { useChatSession } from '../../context/ChatSessionContext';
import MemoryPanel from './MemoryPanel';

export type ModelSelectOption = { value: string; label: string };

export type ChatControlsProps = {
  selectedProvider?: string;
  onProviderChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  selectedModel?: string;
  onModelChange?: (value: string) => void;
  availableModels?: ModelSelectOption[];
  temperature?: number;
  onTemperatureChange?: (value: number) => void;
  selectedDocIds?: Array<string | number>;
  onShowDocModal?: () => void;
  streaming: boolean;
  onShowPromptModal: () => void;
  onExportChat: () => void;
  onExportPdf: () => void;
  messagesCount: number;
  conversationId?: string | number | null;
  onShowGuideModal?: () => void;
  advisoryWarningCount?: number;
  webSearchEnabled?: boolean;
  onToggleWebSearch?: () => void;
  toolsEnabled?: boolean;
  onToggleTools?: () => void;
  toolsSupported?: boolean;
};

const ChatControls = React.memo(function ChatControls(props: ChatControlsProps) {
  const session = useChatSession();
  const selectedProvider = session?.model.selectedProvider ?? props.selectedProvider ?? 'openai';
  const onProviderChange = session?.model.handleProviderChange ?? props.onProviderChange ?? (() => {});
  const selectedModel = session?.model.activeModel ?? props.selectedModel ?? '';
  const onModelChange = session?.model.setSelectedModel ?? props.onModelChange ?? (() => {});
  const availableModels = session?.model.availableModels ?? props.availableModels ?? [];
  const temperature = session?.model.temperature ?? props.temperature ?? 0.7;
  const onTemperatureChange = session?.model.setTemperature ?? props.onTemperatureChange ?? (() => {});
  const selectedDocIds = session?.documents.selectedDocIds ?? props.selectedDocIds ?? [];
  const onShowDocModal = session
    ? () => session.documents.setShowDocModal(true)
    : props.onShowDocModal ?? (() => {});
  const {
    streaming,
    onShowPromptModal,
    onExportChat,
    onExportPdf,
    messagesCount,
    conversationId,
    onShowGuideModal,
    advisoryWarningCount,
    webSearchEnabled,
    onToggleWebSearch,
    toolsEnabled,
    onToggleTools,
    toolsSupported,
  } = props;
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pb-3 mb-3 border-bottom border-secondary border-opacity-25">
        <div className="d-flex align-items-center gap-2">
          <div className="d-flex align-items-center gap-2" data-tour="model-selector">
          <Form.Select
            size="sm"
            value={selectedProvider}
            onChange={onProviderChange}
            disabled={streaming}
            aria-label="Провайдер AI"
            className="bg-dark text-light border-secondary shadow-none"
            style={{ width: 'auto' }}
          >
            <option value="openai">⚡ OpenAI</option>
            <option value="anthropic">🧠 Anthropic Claude</option>
            <option value="gemini">✨ Google Gemini</option>
            <option value="ollama">🦙 Ollama (Local)</option>
          </Form.Select>

          <Form.Select
            size="sm"
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={streaming}
            aria-label="Модель AI"
            className="bg-dark text-light border-secondary shadow-none"
            style={{ width: 'auto' }}
          >
            {availableModels.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Form.Select>
          </div>

          <Button
            variant="outline-info"
            size="sm"
            onClick={onShowPromptModal}
            title="Бібліотека готових системних ролей"
            className="d-flex align-items-center gap-1"
          >
            💡 Ролі AI
          </Button>

          <Button
            variant={selectedDocIds.length > 0 ? 'success' : 'outline-secondary'}
            size="sm"
            onClick={onShowDocModal}
            title="Прикріпити RAG документи"
            className="d-flex align-items-center gap-1"
          >
            📎{' '}
            {selectedDocIds.length > 0
              ? `RAG (${selectedDocIds.length})`
              : 'Документи'}
          </Button>

          {onToggleWebSearch && (
            <Button
              variant={webSearchEnabled ? 'primary' : 'outline-secondary'}
              size="sm"
              onClick={onToggleWebSearch}
              disabled={streaming}
              title={
                webSearchEnabled
                  ? 'Вимкнути веб-пошук'
                  : 'Увімкнути веб-пошук (Google Search / SearXNG / Tavily)'
              }
              aria-label="Веб-пошук"
              data-tour="web-search-toggle"
              className="d-flex align-items-center gap-1"
            >
              🌐 Веб-пошук
              {webSearchEnabled ? (
                <span className="badge bg-light text-dark ms-1">Увімк</span>
              ) : null}
            </Button>
          )}

          {onToggleTools && (
            <Button
              variant={toolsEnabled ? 'primary' : 'outline-secondary'}
              size="sm"
              onClick={onToggleTools}
              disabled={streaming || toolsSupported === false}
              title={
                toolsSupported === false
                  ? 'Обрана модель не підтримує автономні інструменти'
                  : toolsEnabled
                  ? 'Вимкнути автономні інструменти'
                  : 'Увімкнути автономні інструменти (Tools)'
              }
              aria-label="Автономні інструменти"
              data-tour="tools-toggle"
              className="d-flex align-items-center gap-1"
            >
              🛠 Інструменти
              {toolsSupported === false ? (
                <span className="badge bg-secondary ms-1">Н/Д</span>
              ) : toolsEnabled ? (
                <span className="badge bg-light text-dark ms-1">Увімк</span>
              ) : null}
            </Button>
          )}

          {conversationId != null && (
            <Button
              variant="outline-primary"
              size="sm"
              onClick={() => setShowMemoryPanel(true)}
              className="d-flex align-items-center gap-1"
            >
              🧠 Memory
            </Button>
          )}

          {onShowGuideModal && (
            <Button
              variant={
                advisoryWarningCount && advisoryWarningCount > 0
                  ? 'warning'
                  : 'outline-light'
              }
              size="sm"
              onClick={onShowGuideModal}
              title="Гід по системі та поради"
              className="d-flex align-items-center gap-1"
            >
              🧭 Гід
              {advisoryWarningCount && advisoryWarningCount > 0 ? (
                <span className="badge bg-danger ms-1">
                  {advisoryWarningCount}
                </span>
              ) : null}
            </Button>
          )}

          {messagesCount > 0 && (
            <>
              <Button
                variant="outline-warning"
                size="sm"
                onClick={onExportChat}
                title="Експорт чату у Markdown"
                className="d-flex align-items-center gap-1"
              >
                💾 Експорт MD
              </Button>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={onExportPdf}
                title="Експорт чату у PDF"
                className="d-flex align-items-center gap-1"
              >
                📕 Експорт PDF
              </Button>
            </>
          )}
        </div>

        <div className="d-flex align-items-center gap-2" style={{ minWidth: '180px' }}>
          <small className="text-muted">🌡 {temperature}</small>
          <Form.Range
            min="0"
            max="1.5"
            step="0.1"
            value={temperature}
            onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
            disabled={streaming}
            aria-label="Температура"
          />
        </div>
      </div>

      {conversationId != null && (
        <MemoryPanel
          show={showMemoryPanel}
          onHide={() => setShowMemoryPanel(false)}
          conversationId={conversationId}
        />
      )}
    </>
  );
});

ChatControls.displayName = 'ChatControls';

export default ChatControls;
