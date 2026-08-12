/**
 * Сторінка налаштувань AI — провайдер, модель, температура, system prompt, каталог моделей.
 */
import React, { useState, useEffect, useMemo, type FormEvent, type ChangeEvent } from 'react';
import { Container, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { useModels } from '../hooks/useModels';
import { modelsAPI } from '../services/api';
import { catalogModelsToOptions, type ModelOption } from '../utils/catalogModelOptions';
import ModelCatalog from '../components/settings/ModelCatalog';
import ProviderAndModelCard from '../components/settings/ProviderAndModelCard';
import RagStatusCard from '../components/settings/RagStatusCard';
import GenerationParamsCard from '../components/settings/GenerationParamsCard';
import SystemPromptCard from '../components/settings/SystemPromptCard';
import DesktopUpdatesCard from '../components/settings/DesktopUpdatesCard';
import type { SettingsUpdatePayload } from '../types/api';

function normalizeProvider(raw: string | undefined): string {
  const prov = raw || 'openai';
  return prov === 'openai' || prov === 'ollama' ? prov : 'openai';
}

const Settings: React.FC = () => {
  const { data: settingsData, isLoading: isLoadingSettings } = useSettings();
  const updateSettingsMutation = useUpdateSettings();
  const { data: catalogModels = [] } = useModels();

  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('');
  const [remoteModels, setRemoteModels] = useState<ModelOption[]>([]);
  const [ollamaHost, setOllamaHost] = useState('http://127.0.0.1:11434/v1/chat/completions');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [clearOpenaiKey, setClearOpenaiKey] = useState(false);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [error, setError] = useState('');
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'ok' | 'error' | null>(null);

  const settingsFingerprint = settingsData
    ? [
        settingsData.default_provider,
        settingsData.default_model,
        settingsData.temperature,
        settingsData.max_tokens,
        settingsData.default_ollama_host,
        settingsData.system_prompt,
        settingsData.has_openai_api_key,
      ].join('|')
    : '';

  useEffect(() => {
    if (!settingsData) return;
    setProvider(normalizeProvider(settingsData.default_provider));
    setModel(settingsData.default_model || '');
    setTemperature(parseFloat(String(settingsData.temperature ?? 0.7)) || 0.7);
    setMaxTokens(parseInt(String(settingsData.max_tokens ?? 2000), 10) || 2000);
    setOllamaHost(
      settingsData.default_ollama_host ||
        'http://127.0.0.1:11434/v1/chat/completions'
    );
    setSystemPrompt(String(settingsData.system_prompt || ''));
    setHasOpenaiKey(Boolean(settingsData.has_openai_api_key));
    setOpenaiApiKey('');
    setClearOpenaiKey(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsFingerprint]);

  const catalogOptions = useMemo(
    () => catalogModelsToOptions(catalogModels, provider),
    [catalogModels, provider]
  );

  const currentModels =
    provider === 'ollama' && remoteModels.length > 0
      ? remoteModels
      : catalogOptions;

  const activeModel = currentModels.some((opt) => opt.value === model)
    ? model
    : currentModels[0]?.value || '';

  const handleProviderChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setProvider(val);
    setRemoteModels([]);
    const options = catalogModelsToOptions(catalogModels, val);
    setModel(options[0]?.value || '');
  };

  const handleFetchRemoteModels = async () => {
    setLoadingRemote(true);
    setError('');
    setOllamaStatus(null);
    try {
      const response = await modelsAPI.getRemote('ollama', ollamaHost);
      const raw = Array.isArray(response.data)
        ? response.data
        : response.data?.models || [];
      const fetched: ModelOption[] = raw.map((m) => ({
        value: String(m.id || m.name || m.value || ''),
        label: String(m.name || m.id || m.label || ''),
      }));
      setRemoteModels(fetched);
      if (fetched.length > 0) {
        setModel(fetched[0].value);
        setOllamaStatus('ok');
        toast.success(`Знайдено ${fetched.length} моделей Ollama`);
      } else {
        setOllamaStatus('error');
        setError('Моделей не знайдено. Переконайтеся, що Ollama запущено.');
      }
    } catch (err: unknown) {
      setOllamaStatus('error');
      const ax = err as AxiosError<{ error?: string }>;
      setError(
        ax.response?.data?.error ||
          'Не вдалося підключитися до Ollama. Перевірте URL та доступність сервера.'
      );
    } finally {
      setLoadingRemote(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const payload: SettingsUpdatePayload = {
        default_provider: provider,
        default_model: activeModel,
        temperature: Number(temperature),
        max_tokens: Number(maxTokens),
        default_ollama_host: ollamaHost,
        system_prompt: systemPrompt,
      };
      if (clearOpenaiKey) {
        payload.clear_openai_api_key = true;
        payload.openai_api_key = '';
      } else if (openaiApiKey.trim()) {
        payload.openai_api_key = openaiApiKey.trim();
      }
      await updateSettingsMutation.mutateAsync(payload);
      setOpenaiApiKey('');
      setClearOpenaiKey(false);
      toast.success('Налаштування збережено! ✅');
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }> & { message?: string };
      const msg = ax.response?.data?.error || ax.message || 'Помилка збереження';
      setError(msg);
      toast.error('Не вдалося зберегти налаштування');
    }
  };

  if (isLoadingSettings) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" variant="primary" />
        <p className="text-muted mt-2">Завантаження налаштувань...</p>
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: 740 }}>
      <h4 className="fw-bold mb-4">⚙️ Налаштування AI</h4>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')} className="mb-3">
          {error}
        </Alert>
      )}

      <Form onSubmit={handleSave}>
        <ProviderAndModelCard
          provider={provider}
          activeModel={activeModel}
          currentModels={currentModels}
          ollamaHost={ollamaHost}
          loadingRemote={loadingRemote}
          ollamaStatus={ollamaStatus}
          onProviderChange={handleProviderChange}
          onModelChange={setModel}
          onOllamaHostChange={(value) => {
            setOllamaHost(value);
            setOllamaStatus(null);
          }}
          onFetchRemoteModels={() => void handleFetchRemoteModels()}
        />

        <RagStatusCard
          ragEmbeddingMode={settingsData?.rag_embedding_mode}
          hasOpenaiKey={hasOpenaiKey}
          openaiApiKey={openaiApiKey}
          clearOpenaiKey={clearOpenaiKey}
          onOpenaiApiKeyChange={(value) => {
            setOpenaiApiKey(value);
            if (value) setClearOpenaiKey(false);
          }}
          onClearOpenaiKeyChange={(checked) => {
            setClearOpenaiKey(checked);
            if (checked) setOpenaiApiKey('');
          }}
        />

        <GenerationParamsCard
          temperature={temperature}
          maxTokens={maxTokens}
          onTemperatureChange={setTemperature}
          onMaxTokensChange={setMaxTokens}
        />

        <SystemPromptCard
          systemPrompt={systemPrompt}
          onSystemPromptChange={setSystemPrompt}
        />

        <Button
          type="submit"
          className="btn-accent px-4 py-2 d-flex align-items-center gap-2 mb-4"
          disabled={updateSettingsMutation.isPending}
        >
          {updateSettingsMutation.isPending ? (
            <>
              <Spinner size="sm" animation="border" /> Збереження...
            </>
          ) : (
            '💾 Зберегти налаштування'
          )}
        </Button>
      </Form>

      <div id="desktop-updates">
        <DesktopUpdatesCard />
      </div>

      <div className="glass-panel p-4 mb-3">
        <h6
          className="fw-semibold mb-3 text-muted text-uppercase"
          style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
        >
          Каталог моделей
        </h6>
        <ModelCatalog />
      </div>
    </Container>
  );
};

export default Settings;
