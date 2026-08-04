/**
 * @file pages/Settings.js
 * Сторінка налаштувань AI — провайдер, модель, температура, system prompt.
 * Використовує useSettings / useUpdateSettings hooks (@tanstack/react-query).
 */

import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { modelsAPI } from '../services/api';

/** Реальні підтримувані провайдери (без фейкових Azure/ChatGPT aliases) */
const providerOptions = [
  { value: 'openai', label: 'OpenAI API' },
  { value: 'ollama', label: 'Ollama (Local Server)' },
];

/** Вбудовані моделі для кожного провайдера */
const modelOptions = {
  openai: [
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
    { value: 'gpt-4o', label: 'GPT-4o' },
  ],
  ollama: [
    { value: 'llama2', label: 'Llama 2' },
    { value: 'llama3', label: 'Llama 3' },
    { value: 'mistral', label: 'Mistral' },
    { value: 'codellama', label: 'CodeLlama' },
  ],
};

const Settings = () => {
  // React Query hooks для завантаження та збереження налаштувань
  const { data: settingsData, isLoading: isLoadingSettings } = useSettings();
  const updateSettingsMutation = useUpdateSettings();

  // Локальний стан форми
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-3.5-turbo');
  const [remoteModels, setRemoteModels] = useState([]);
  const [ollamaHost, setOllamaHost] = useState('http://127.0.0.1:11434/v1/chat/completions');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [error, setError] = useState('');
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(null); // 'ok' | 'error' | null

  /** При завантаженні налаштувань з API — заповнюємо форму */
  useEffect(() => {
    if (settingsData) {
      let prov = settingsData.default_provider || 'openai';
      if (prov !== 'openai' && prov !== 'ollama') prov = 'openai';
      setProvider(prov);
      setModel(settingsData.default_model || 'gpt-3.5-turbo');
      setTemperature(parseFloat(settingsData.temperature) || 0.7);
      setMaxTokens(parseInt(settingsData.max_tokens, 10) || 2000);
      setOllamaHost(settingsData.default_ollama_host || 'http://127.0.0.1:11434/v1/chat/completions');
      setSystemPrompt(settingsData.system_prompt || '');
    }
  }, [settingsData]);

  /** Список моделей: якщо Ollama і є remote — показуємо їх, інакше static */
  const currentModels = provider === 'ollama' && remoteModels.length > 0
    ? remoteModels
    : (modelOptions[provider] || modelOptions.openai);

  /** При зміні провайдера — скидаємо модель до першої доступної */
  const handleProviderChange = (e) => {
    const val = e.target.value;
    setProvider(val);
    const models = val === 'ollama' && remoteModels.length > 0
      ? remoteModels
      : (modelOptions[val] || modelOptions.openai);
    setModel(models[0]?.value || '');
    setRemoteModels([]);
  };

  /** Завантажуємо список моделей з Ollama сервера */
  const handleFetchRemoteModels = async () => {
    setLoadingRemote(true);
    setError('');
    setOllamaStatus(null);
    try {
      const response = await modelsAPI.getRemote('ollama', ollamaHost);
      const fetched = response.data.map((m) => ({
        value: m.id || m.name,
        label: m.name || m.id,
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
    } catch (err) {
      setOllamaStatus('error');
      setError(
        err.response?.data?.error ||
          'Не вдалося підключитися до Ollama. Перевірте URL та доступність сервера.'
      );
    } finally {
      setLoadingRemote(false);
    }
  };

  /** Зберігаємо налаштування через mutation hook */
  const handleSave = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await updateSettingsMutation.mutateAsync({
        default_provider: provider,
        default_model: model,
        temperature: parseFloat(temperature),
        max_tokens: parseInt(maxTokens, 10),
        default_ollama_host: ollamaHost,
        system_prompt: systemPrompt
      });
      toast.success('Налаштування збережено! ✅');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Помилка збереження';
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
          <h6 className="fw-semibold mb-3 text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
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
                  {providerOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="bg-dark text-light border-secondary shadow-none"
                >
                  {currentModels.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Form.Select>
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
                      {loadingRemote ? <Spinner size="sm" animation="border" /> : '🔍 Перевірити'}
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
          <h6 className="fw-semibold mb-3 text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
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
          <h6 className="fw-semibold mb-3 text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
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
          className="btn-accent px-4 py-2 d-flex align-items-center gap-2"
          disabled={updateSettingsMutation.isPending}
        >
          {updateSettingsMutation.isPending
            ? <><Spinner size="sm" animation="border" /> Збереження...</>
            : '💾 Зберегти налаштування'
          }
        </Button>
      </Form>
    </Container>
  );
};

export default Settings;
