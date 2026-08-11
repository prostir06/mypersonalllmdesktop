/**
 * Сторінка налаштувань AI — провайдер, модель, температура, system prompt, каталог моделей.
 */
import React, { useState, useEffect, useMemo, type FormEvent, type ChangeEvent } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { useModels } from '../hooks/useModels';
import { modelsAPI } from '../services/api';
import { catalogModelsToOptions, type ModelOption } from '../utils/catalogModelOptions';
import ModelCatalog from '../components/settings/ModelCatalog';
import type { SettingsUpdatePayload, UserSettings } from '../types/api';

const providerOptions = [
  { value: 'openai', label: 'OpenAI API' },
  { value: 'ollama', label: 'Ollama (Local Server)' },
] as const;

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
        <div className="glass-panel p-4 mb-3">
          <h6
            className="fw-semibold mb-3 text-muted text-uppercase"
            style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
          >
            🔌 Провайдер та модель
          </h6>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label htmlFor="provider-select" className="small fw-semibold">
                  Основний Провайдер AI
                </Form.Label>
                <Form.Select
                  id="provider-select"
                  value={provider}
                  onChange={handleProviderChange}
                  className="bg-dark text-light border-secondary shadow-none"
                >
                  {providerOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label htmlFor="model-select" className="small fw-semibold">
                  Модель за замовчуванням
                </Form.Label>
                <Form.Select
                  id="model-select"
                  value={activeModel}
                  onChange={(e) => setModel(e.target.value)}
                  className="bg-dark text-light border-secondary shadow-none"
                  disabled={currentModels.length === 0}
                >
                  {currentModels.length === 0 ? (
                    <option value="">Немає моделей</option>
                  ) : (
                    currentModels.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))
                  )}
                </Form.Select>
                {currentModels.length === 0 && (
                  <Form.Text className="text-muted">
                    Додайте модель у каталозі нижче
                  </Form.Text>
                )}
              </Form.Group>
            </Col>

            {provider === 'ollama' && (
              <Col md={12}>
                <Form.Group>
                  <Form.Label htmlFor="ollama-host" className="small fw-semibold">
                    Ollama Server URL
                  </Form.Label>
                  <div className="d-flex gap-2 align-items-center">
                    <Form.Control
                      id="ollama-host"
                      type="url"
                      value={ollamaHost}
                      onChange={(e) => {
                        setOllamaHost(e.target.value);
                        setOllamaStatus(null);
                      }}
                      placeholder="http://127.0.0.1:11434/v1/chat/completions"
                      className="bg-dark text-light border-secondary shadow-none"
                    />
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={handleFetchRemoteModels}
                      disabled={loadingRemote}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {loadingRemote ? (
                        <Spinner size="sm" animation="border" />
                      ) : (
                        '🔍 Перевірити'
                      )}
                    </Button>
                    {ollamaStatus === 'ok' && (
                      <span className="badge text-bg-success">online</span>
                    )}
                    {ollamaStatus === 'error' && (
                      <span className="badge text-bg-danger">offline</span>
                    )}
                  </div>
                </Form.Group>
              </Col>
            )}
          </Row>
        </div>

        <div className="glass-panel p-4 mb-3">
          <h6
            className="fw-semibold mb-3 text-muted text-uppercase"
            style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
          >
            Ключ OpenAI
          </h6>
          {!hasOpenaiKey && settingsData?.rag_embedding_mode === 'fallback' && (
            <Alert variant="warning" className="small py-2">
              RAG: fallback — семантичний пошук недоступний. Увімкніть провайдер
              Ollama (без OpenAI key) або додайте OpenAI API key.
            </Alert>
          )}
          {settingsData?.rag_embedding_mode === 'ollama' && (
            <Alert variant="success" className="small py-2">
              RAG: семантичний пошук через Ollama (nomic-embed-text).
            </Alert>
          )}
          {settingsData?.rag_embedding_mode === 'openai' && hasOpenaiKey && (
            <Alert variant="success" className="small py-2">
              RAG: семантичний пошук через OpenAI embeddings.
            </Alert>
          )}
          <Form.Group className="mb-2">
            <Form.Label htmlFor="openai-api-key" className="small fw-semibold">
              API ключ (зберігається зашифрованим)
              {hasOpenaiKey && (
                <span className="badge text-bg-success ms-2">збережено</span>
              )}
            </Form.Label>
            <Form.Control
              id="openai-api-key"
              type="password"
              autoComplete="off"
              value={openaiApiKey}
              onChange={(e) => {
                setOpenaiApiKey(e.target.value);
                if (e.target.value) setClearOpenaiKey(false);
              }}
              placeholder={
                hasOpenaiKey
                  ? 'Залиште порожнім, щоб не змінювати'
                  : 'sk-...'
              }
              className="bg-dark text-light border-secondary shadow-none"
              disabled={clearOpenaiKey}
            />
            <Form.Check
              className="mt-2 small"
              type="checkbox"
              id="clear-openai-key"
              label="Очистити збережений ключ"
              checked={clearOpenaiKey}
              onChange={(e) => {
                setClearOpenaiKey(e.target.checked);
                if (e.target.checked) setOpenaiApiKey('');
              }}
            />
            <Form.Text className="text-muted">
              Якщо ключ не задано — використовується OPENAI_API_KEY з сервера.
            </Form.Text>
          </Form.Group>
        </div>

        <div className="glass-panel p-4 mb-3">
          <h6
            className="fw-semibold mb-3 text-muted text-uppercase"
            style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
          >
            🎛️ Параметри генерації
          </h6>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label htmlFor="temperature-input" className="small fw-semibold">
                  Температура креативності
                  <span className="text-muted ms-2">({temperature})</span>
                </Form.Label>
                <Form.Range
                  id="temperature-input"
                  min="0"
                  max="2"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                />
                <div className="d-flex justify-content-between">
                  <small className="text-muted">0 — Точно</small>
                  <small className="text-muted">2 — Креативно</small>
                </div>
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label htmlFor="tokens-input" className="small fw-semibold">
                  Максимальна кількість токенів
                </Form.Label>
                <Form.Control
                  id="tokens-input"
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                  min="100"
                  max="4000"
                  step="100"
                  className="bg-dark text-light border-secondary shadow-none"
                />
              </Form.Group>
            </Col>
          </Row>
        </div>

        <div className="glass-panel p-4 mb-4">
          <h6
            className="fw-semibold mb-3 text-muted text-uppercase"
            style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
          >
            💬 Системний промпт
          </h6>
          <Form.Group>
            <Form.Label htmlFor="system-prompt" className="small fw-semibold">
              Початкові інструкції для AI (опціонально)
            </Form.Label>
            <Form.Control
              id="system-prompt"
              as="textarea"
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Наприклад: Ти — досвідчений Python-розробник. Відповідай лаконічно та з прикладами коду."
              className="bg-dark text-light border-secondary shadow-none"
              style={{ resize: 'vertical' }}
            />
            <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>
              Цей текст буде передано AI як системне повідомлення на початку кожної розмови.
            </Form.Text>
          </Form.Group>
        </div>

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
