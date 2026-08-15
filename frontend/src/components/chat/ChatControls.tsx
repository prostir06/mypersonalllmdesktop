/**
 * Chat toolbar: provider, model, temperature, prompts, RAG, export.
 */
import React, { type ChangeEvent } from 'react';
import { Form, Button } from 'react-bootstrap';

export type ModelSelectOption = { value: string; label: string };

export type ChatControlsProps = {
  selectedProvider: string;
  onProviderChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  selectedModel: string;
  onModelChange: (value: string) => void;
  availableModels: ModelSelectOption[];
  temperature: number;
  onTemperatureChange: (value: number) => void;
  selectedDocIds: Array<string | number>;
  streaming: boolean;
  onShowPromptModal: () => void;
  onShowDocModal: () => void;
  onExportChat: () => void;
  onExportPdf: () => void;
  messagesCount: number;
};

const ChatControls = React.memo(function ChatControls({
  selectedProvider,
  onProviderChange,
  selectedModel,
  onModelChange,
  availableModels,
  temperature,
  onTemperatureChange,
  selectedDocIds,
  streaming,
  onShowPromptModal,
  onShowDocModal,
  onExportChat,
  onExportPdf,
  messagesCount,
}: ChatControlsProps) {
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pb-3 mb-3 border-bottom border-secondary border-opacity-25">
      <div className="d-flex align-items-center gap-2">
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
  );
});

ChatControls.displayName = 'ChatControls';

export default ChatControls;
