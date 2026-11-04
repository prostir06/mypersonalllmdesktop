/**
 * Сторінка налаштувань AI — провайдер, модель, температура, system prompt, каталог моделей.
 */
import React, { useState, useMemo, type FormEvent, type ChangeEvent } from 'react';
import { Container, Tabs, Tab, Alert, Spinner } from 'react-bootstrap';
import { useInRouterContext, useSearchParams, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { useModels } from '../hooks/useModels';
import { modelsAPI } from '../services/api';
import { catalogModelsToOptions, type ModelOption } from '../utils/catalogModelOptions';
import GeneralSettingsTab from '../components/settings/GeneralSettingsTab';
import ApiKeysTab from '../components/settings/ApiKeysTab';
import ModelCatalog from '../components/settings/ModelCatalog';
import UserMemoryCard from '../components/settings/UserMemoryCard';
import DesktopUpdatesCard from '../components/settings/DesktopUpdatesCard';
import type { SettingsUpdatePayload } from '../types/api';

const ALLOWED_PROVIDERS = new Set(['openai', 'ollama', 'gemini', 'anthropic']);
const VALID_TABS = new Set(['general', 'api-keys', 'models', 'memory', 'updates']);

function normalizeProvider(raw: string | undefined): string {
  const prov = raw || 'openai';
  return ALLOWED_PROVIDERS.has(prov) ? prov : 'openai';
}

interface SettingsViewProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ activeTab, onTabChange }) => {
  const { data: settingsData, isLoading: isLoadingSettings } = useSettings();
  const updateSettingsMutation = useUpdateSettings();
  const { data: catalogModels = [] } = useModels();

  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('');
  const [remoteModels, setRemoteModels] = useState<ModelOption[]>([]);
  const [ollamaHost, setOllamaHost] = useState('http://127.0.0.1:11434/v1/chat/completions');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [error, setError] = useState('');
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'ok' | 'error' | null>(null);
  const [hydratedKey, setHydratedKey] = useState('');

  const settingsFingerprint = settingsData
    ? [
        settingsData.default_provider,
        settingsData.default_model,
        settingsData.temperature,
        settingsData.max_tokens,
        settingsData.default_ollama_host,
        settingsData.system_prompt,
        settingsData.has_openai_api_key,
        settingsData.has_gemini_api_key,
        settingsData.has_anthropic_api_key,
        settingsData.tools_enabled ?? settingsData.toolsEnabled,
      ].join('|')
    : '';

  // Adjust form when server settings change (React “adjust state during render”).
  if (settingsData && settingsFingerprint !== hydratedKey) {
    setHydratedKey(settingsFingerprint);
    setProvider(normalizeProvider(settingsData.default_provider));
    setModel(settingsData.default_model || '');
    setTemperature(parseFloat(String(settingsData.temperature ?? 0.7)) || 0.7);
    setMaxTokens(parseInt(String(settingsData.max_tokens ?? 4096), 10) || 4096);
    setOllamaHost(
      settingsData.default_ollama_host ||
        'http://127.0.0.1:11434/v1/chat/completions'
    );
    setSystemPrompt(String(settingsData.system_prompt || ''));
    const serverTools = settingsData.tools_enabled ?? settingsData.toolsEnabled;
    setToolsEnabled(serverTools !== undefined ? Boolean(serverTools) : true);
    setHasOpenaiKey(Boolean(settingsData.has_openai_api_key));
  }

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

  const handleSaveGeneral = async (e: FormEvent) => {
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
        tools_enabled: toolsEnabled,
      };
      await updateSettingsMutation.mutateAsync(payload);
      toast.success('Налаштування збережено! ✅');
    } catch (err: unknown) {
      console.error('Failed to save settings:', err);
      const ax = err as AxiosError<{ error?: string }> & { message?: string };
      const msg = ax.response?.data?.error || ax.message || 'Помилка збереження';
      setError(msg);
      toast.error('Не вдалося зберегти налаштування');
    }
  };

  const handleSaveOpenaiKey = async (key: string, clear: boolean) => {
    try {
      await updateSettingsMutation.mutateAsync({
        openai_api_key: key,
        clear_openai_key: clear,
        clear_openai_api_key: clear,
      });
      setHasOpenaiKey(!clear && Boolean(key.trim()));
      toast.success(clear ? 'Ключ OpenAI видалено! ✅' : 'Ключ OpenAI збережено! ✅');
    } catch (err: unknown) {
      console.error('Failed to save OpenAI API key:', err);
      const ax = err as AxiosError<{ error?: string }> & { message?: string };
      const msg = ax.response?.data?.error || ax.message || 'Не вдалося зберегти ключ OpenAI';
      setError(msg);
      toast.error('Не вдалося зберегти ключ OpenAI');
      throw err;
    }
  };

  const handleSaveGeminiKey = async (key: string) => {
    try {
      await updateSettingsMutation.mutateAsync({ gemini_api_key: key });
      toast.success('Gemini API ключ збережено! ✅');
    } catch (err: unknown) {
      console.error('Failed to save Gemini API key:', err);
      const ax = err as AxiosError<{ error?: string }> & { message?: string };
      const msg = ax.response?.data?.error || ax.message || 'Не вдалося зберегти ключ Gemini';
      setError(msg);
      toast.error('Не вдалося зберегти ключ Gemini');
      throw err;
    }
  };

  const handleClearGeminiKey = async () => {
    try {
      await updateSettingsMutation.mutateAsync({ clear_gemini_api_key: true });
      toast.success('Gemini API ключ видалено! ✅');
    } catch (err: unknown) {
      console.error('Failed to clear Gemini API key:', err);
      const ax = err as AxiosError<{ error?: string }> & { message?: string };
      const msg = ax.response?.data?.error || ax.message || 'Не вдалося видалити ключ Gemini';
      setError(msg);
      toast.error('Не вдалося видалити ключ Gemini');
      throw err;
    }
  };

  const handleSaveClaudeKey = async (key: string) => {
    try {
      await updateSettingsMutation.mutateAsync({ anthropic_api_key: key });
      toast.success('Claude API ключ збережено! ✅');
    } catch (err: unknown) {
      console.error('Failed to save Claude API key:', err);
      const ax = err as AxiosError<{ error?: string }> & { message?: string };
      const msg = ax.response?.data?.error || ax.message || 'Не вдалося зберегти ключ Claude';
      setError(msg);
      toast.error('Не вдалося зберегти ключ Claude');
      throw err;
    }
  };

  const handleClearClaudeKey = async () => {
    try {
      await updateSettingsMutation.mutateAsync({ clear_anthropic_api_key: true });
      toast.success('Claude API ключ видалено! ✅');
    } catch (err: unknown) {
      console.error('Failed to clear Claude API key:', err);
      const ax = err as AxiosError<{ error?: string }> & { message?: string };
      const msg = ax.response?.data?.error || ax.message || 'Не вдалося видалити ключ Claude';
      setError(msg);
      toast.error('Не вдалося видалити ключ Claude');
      throw err;
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

      <Tabs
        activeKey={activeTab}
        onSelect={(k) => k && onTabChange(k)}
        id="settings-tabs"
        className="mb-4"
        unmountOnExit={false}
      >
        <Tab eventKey="general" title="Загальні">
          <GeneralSettingsTab
            provider={provider}
            activeModel={activeModel}
            currentModels={currentModels}
            ollamaHost={ollamaHost}
            loadingRemote={loadingRemote}
            ollamaStatus={ollamaStatus}
            temperature={temperature}
            maxTokens={maxTokens}
            systemPrompt={systemPrompt}
            isSaving={updateSettingsMutation.isPending}
            error={error}
            ragEmbeddingMode={settingsData?.rag_embedding_mode}
            hasOpenaiKey={hasOpenaiKey}
            tools_enabled={toolsEnabled}
            onToolsEnabledChange={setToolsEnabled}
            onProviderChange={handleProviderChange}
            onModelChange={setModel}
            onOllamaHostChange={(value) => {
              setOllamaHost(value);
              setOllamaStatus(null);
            }}
            onFetchRemoteModels={handleFetchRemoteModels}
            onTemperatureChange={setTemperature}
            onMaxTokensChange={setMaxTokens}
            onSystemPromptChange={setSystemPrompt}
            onSubmit={handleSaveGeneral}
          />
        </Tab>

        <Tab eventKey="api-keys" title="API Ключі">
          <ApiKeysTab
            hasOpenaiKey={hasOpenaiKey}
            onSaveOpenaiKey={handleSaveOpenaiKey}
            hasGeminiKey={Boolean(settingsData?.has_gemini_api_key)}
            isSavingGemini={updateSettingsMutation.isPending}
            onSaveGeminiKey={handleSaveGeminiKey}
            onClearGeminiKey={handleClearGeminiKey}
            hasClaudeKey={Boolean(settingsData?.has_anthropic_api_key)}
            isSavingClaude={updateSettingsMutation.isPending}
            onSaveClaudeKey={handleSaveClaudeKey}
            onClearClaudeKey={handleClearClaudeKey}
          />
        </Tab>

        <Tab eventKey="models" title="Каталог моделей">
          <div className="glass-panel p-4 mb-3">
            <h6
              className="fw-semibold mb-3 text-muted text-uppercase"
              style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
            >
              Каталог моделей
            </h6>
            <ModelCatalog />
          </div>
        </Tab>

        <Tab eventKey="memory" title="Пам'ять">
          <UserMemoryCard />
        </Tab>

        <Tab eventKey="updates" title="Оновлення">
          <div id="desktop-updates">
            <DesktopUpdatesCard />
          </div>
        </Tab>
      </Tabs>
    </Container>
  );
};

const SettingsWithRouter: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const tabParam = searchParams.get('tab');
  const initialFromHash = location.hash === '#desktop-updates' ? 'updates' : undefined;
  const activeTab = tabParam && VALID_TABS.has(tabParam)
    ? tabParam
    : (initialFromHash || 'general');

  const handleTabChange = (nextTab: string) => {
    if (!VALID_TABS.has(nextTab)) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', nextTab);
        return next;
      },
      { replace: true }
    );
  };

  return <SettingsView activeTab={activeTab} onTabChange={handleTabChange} />;
};

const SettingsWithoutRouter: React.FC = () => {
  const [activeTab, setActiveTab] = useState('general');
  return <SettingsView activeTab={activeTab} onTabChange={setActiveTab} />;
};

const Settings: React.FC = () => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <SettingsWithRouter />;
  }
  return <SettingsWithoutRouter />;
};

export default Settings;
