import React from 'react';
import { Form, Button, Alert } from 'react-bootstrap';
import ProviderAndModelCard from './ProviderAndModelCard';
import GenerationParamsCard from './GenerationParamsCard';
import SystemPromptCard from './SystemPromptCard';
import RagStatusCard from './RagStatusCard';
import type { ModelOption } from '../../utils/catalogModelOptions';

export interface GeneralSettingsTabProps {
  provider: string;
  onProviderChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  activeModel: string;
  onModelChange: (model: string) => void;
  currentModels: ModelOption[];
  ollamaHost: string;
  onOllamaHostChange: (host: string) => void;
  onFetchRemoteModels: () => Promise<void> | void;
  loadingRemote: boolean;
  ollamaStatus: 'ok' | 'error' | null;
  temperature: number;
  onTemperatureChange: (temp: number) => void;
  maxTokens: number;
  onMaxTokensChange: (tokens: number) => void;
  systemPrompt: string;
  onSystemPromptChange: (prompt: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void> | void;
  isSaving: boolean;
  error?: string;
  ragEmbeddingMode?: 'openai' | 'ollama' | 'fallback';
  hasOpenaiKey?: boolean;
  tools_enabled?: boolean;
  toolsEnabled?: boolean;
  onToolsEnabledChange?: (enabled: boolean) => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
  provider,
  onProviderChange,
  activeModel,
  onModelChange,
  currentModels,
  ollamaHost,
  onOllamaHostChange,
  onFetchRemoteModels,
  loadingRemote,
  ollamaStatus,
  temperature,
  onTemperatureChange,
  maxTokens,
  onMaxTokensChange,
  systemPrompt,
  onSystemPromptChange,
  onSubmit,
  isSaving,
  error,
  ragEmbeddingMode,
  hasOpenaiKey,
  tools_enabled,
  toolsEnabled,
  onToolsEnabledChange,
}) => {
  const isControlled = tools_enabled !== undefined || toolsEnabled !== undefined;
  const [internalToolsEnabled, setInternalToolsEnabled] = React.useState<boolean>(() => {
    if (tools_enabled !== undefined) return Boolean(tools_enabled);
    if (toolsEnabled !== undefined) return Boolean(toolsEnabled);
    return true;
  });

  const currentToolsEnabled = isControlled
    ? Boolean(tools_enabled ?? toolsEnabled)
    : internalToolsEnabled;

  const handleToggleTools = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    if (!isControlled) {
      setInternalToolsEnabled(checked);
    }
    onToolsEnabledChange?.(checked);
  };

  const [showTokens, setShowTokens] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    return window.localStorage.getItem('llm_assistant_show_tokens') !== 'false';
  });

  const handleToggleTokens = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setShowTokens(checked);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('llm_assistant_show_tokens', String(checked));
      window.dispatchEvent(new Event('storage'));
    }
  };

  return (
    <Form onSubmit={onSubmit} className="d-flex flex-column gap-3">
      {error && <Alert variant="danger">{error}</Alert>}
      <ProviderAndModelCard
        provider={provider}
        activeModel={activeModel}
        currentModels={currentModels}
        ollamaHost={ollamaHost}
        loadingRemote={loadingRemote}
        ollamaStatus={ollamaStatus}
        onProviderChange={onProviderChange}
        onModelChange={onModelChange}
        onOllamaHostChange={onOllamaHostChange}
        onFetchRemoteModels={onFetchRemoteModels}
      />
      <GenerationParamsCard
        temperature={temperature}
        onTemperatureChange={onTemperatureChange}
        maxTokens={maxTokens}
        onMaxTokensChange={onMaxTokensChange}
      />
      <SystemPromptCard
        systemPrompt={systemPrompt}
        onSystemPromptChange={onSystemPromptChange}
      />
      <RagStatusCard
        ragEmbeddingMode={ragEmbeddingMode}
        hasOpenaiKey={hasOpenaiKey}
      />
      <div className="glass-panel p-4 mb-3">
        <h6
          className="fw-semibold mb-3 text-muted text-uppercase"
          style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
        >
          🛠 Автономні інструменти
        </h6>
        <Form.Check
          type="switch"
          id="settings-tools-enabled"
          label="Автономні інструменти (Tools & Function Calling)"
          checked={currentToolsEnabled}
          onChange={handleToggleTools}
        />
        <Form.Text className="text-muted d-block mt-2">
          Дозволяє моделям автоматично виконувати безпечний пошук у документах, перегляд пам'яті, системний час та запитувати підтвердження для операцій запису.
        </Form.Text>
      </div>
      <div className="glass-panel p-4 mb-3">
        <h6
          className="fw-semibold mb-3 text-muted text-uppercase"
          style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
        >
          💬 Відображення чату
        </h6>
        <Form.Check
          type="switch"
          id="llm-assistant-show-tokens"
          label="Показувати використання токенів під повідомленнями"
          checked={showTokens}
          onChange={handleToggleTokens}
        />
      </div>
      <div>
        <Button
          type="submit"
          variant="primary"
          disabled={isSaving}
          className="btn-accent px-4 py-2"
          aria-label="Зберегти налаштування"
        >
          {isSaving ? 'Збереження...' : 'Зберегти загальні налаштування'}
        </Button>
      </div>
    </Form>
  );
};

export default GeneralSettingsTab;
