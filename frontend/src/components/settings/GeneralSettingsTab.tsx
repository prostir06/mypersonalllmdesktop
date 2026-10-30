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
}) => (
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

export default GeneralSettingsTab;
