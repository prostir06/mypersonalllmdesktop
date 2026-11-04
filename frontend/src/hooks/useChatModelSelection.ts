import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';
import { modelsAPI } from '../services/api';
import { useModels } from './useModels';
import {
  catalogModelsToOptions,
  type ModelOption,
} from '../utils/catalogModelOptions';
import type { UserSettings } from '../types/api';

type UseChatModelSelectionArgs = {
  settings?: UserSettings;
};

export function useChatModelSelection({
  settings,
}: UseChatModelSelectionArgs) {
  const { data: catalogModels = [] } = useModels();
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [selectedModel, setSelectedModel] = useState('');
  const [remoteModels, setRemoteModels] = useState<ModelOption[]>([]);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [hydratedKey, setHydratedKey] = useState('');

  const catalogOptions = useMemo(
    () => catalogModelsToOptions(catalogModels, selectedProvider),
    [catalogModels, selectedProvider]
  );

  const availableModels = useMemo(() => {
    let list =
      selectedProvider === 'ollama' && remoteModels.length > 0
        ? remoteModels
        : catalogOptions;
    if (selectedModel && !list.some((m) => m.value === selectedModel)) {
      list = [
        { value: selectedModel, label: `${selectedModel} (Обрана)` },
        ...list,
      ];
    }
    return list;
  }, [selectedProvider, remoteModels, catalogOptions, selectedModel]);

  const activeModel = useMemo(() => {
    if (availableModels.length === 0) return selectedModel;
    if (availableModels.some((m) => m.value === selectedModel)) {
      return selectedModel;
    }
    return availableModels[0].value;
  }, [availableModels, selectedModel]);

  const fetchRemoteModels = useCallback(async (hostUrl?: string) => {
    try {
      const response = await modelsAPI.getRemote('ollama', hostUrl);
      const raw = Array.isArray(response.data)
        ? response.data
        : response.data?.models || [];
      const fetched = raw.map((m) => ({
        value: String(m.id || m.name || ''),
        label: `${m.name || m.id} (Локальна)`,
      }));
      if (fetched.length > 0) setRemoteModels(fetched);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Could not fetch remote Ollama models:', message);
    }
  }, []);

  const settingsFingerprint = settings
    ? `${settings.default_provider}|${settings.default_model}|${settings.temperature}|${settings.max_tokens}|${settings.default_ollama_host}`
    : '';

  if (settings && settingsFingerprint !== hydratedKey) {
    setHydratedKey(settingsFingerprint);
    setSelectedProvider(settings.default_provider || 'openai');
    setSelectedModel(settings.default_model || '');
    if (settings.temperature !== undefined) {
      setTemperature(parseFloat(String(settings.temperature)));
    }
    if (settings.max_tokens !== undefined) {
      const n = parseInt(String(settings.max_tokens), 10);
      if (Number.isFinite(n) && n > 0) setMaxTokens(n);
    }
  }

  useEffect(() => {
    if (selectedProvider !== 'ollama') return;
    let cancelled = false;
    (async () => {
      try {
        const response = await modelsAPI.getRemote(
          'ollama',
          settings?.default_ollama_host
        );
        if (cancelled) return;
        const raw = Array.isArray(response.data)
          ? response.data
          : response.data?.models || [];
        const fetched = raw.map((m) => ({
          value: String(m.id || m.name || ''),
          label: `${m.name || m.id} (Локальна)`,
        }));
        if (fetched.length > 0) setRemoteModels(fetched);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Could not fetch remote Ollama models:', message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedProvider, settings?.default_ollama_host]);

  const handleProviderChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const provider = e.target.value;
      setSelectedProvider(provider);
      setRemoteModels([]);
      if (provider === 'ollama') {
        void fetchRemoteModels(settings?.default_ollama_host);
      }
      const models = catalogModelsToOptions(catalogModels, provider);
      setSelectedModel(models[0]?.value || '');
    },
    [catalogModels, fetchRemoteModels, settings?.default_ollama_host]
  );

  return {
    catalogModels,
    selectedProvider,
    activeModel,
    availableModels,
    temperature,
    setTemperature,
    maxTokens,
    handleProviderChange,
    setSelectedModel,
  };
}
