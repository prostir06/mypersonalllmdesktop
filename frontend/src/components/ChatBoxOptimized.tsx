/**
 * Chat orchestrator — wires settings, stream, speech, and documents hooks.
 */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { conversationAPI, modelsAPI } from '../services/api';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { useModels } from '../hooks/useModels';
import { useSpeech } from '../hooks/useSpeech';
import { useChatDocuments } from '../hooks/useChatDocuments';
import { useChatStream, type AttachedImage } from '../hooks/useChatStream';
import { useConversationHistory } from '../hooks/useConversationHistory';
import {
  catalogModelsToOptions,
  type ModelOption,
} from '../utils/catalogModelOptions';
import { modelSupportsVision } from '../utils/modelSupportsVision';
import type { UserSettings } from '../types/api';
import ChatControls from './chat/ChatControls';
import MessageList from './chat/MessageList';
import MessageInput from './chat/MessageInput';
import DocumentModal from './chat/DocumentModal';
import PromptLibraryModal from './PromptLibraryModal';

type ChatBoxOptimizedProps = {
  conversationId?: string | number | null;
  onNewMessage?: (conversationId?: string | number) => void;
};

const ChatBoxOptimized: React.FC<ChatBoxOptimizedProps> = ({
  conversationId,
  onNewMessage,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [selectedModel, setSelectedModel] = useState('');
  const [remoteModels, setRemoteModels] = useState<ModelOption[]>([]);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(
    null
  );
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { data: settings } = useSettings();
  const { data: catalogModels = [] } = useModels();
  const updateSettings = useUpdateSettings();
  const { isListening, speakingIdx, toggleListening, speakText } =
    useSpeech(setInputMessage);
  const {
    userDocuments,
    selectedDocIds,
    showDocModal,
    setShowDocModal,
    uploadingDoc,
    fileInputRef,
    handleFileUpload,
    handleToggleDoc,
    handleDeleteDoc,
    handleRetryDoc,
    retryingDocId,
    hasMoreDocuments,
    loadMoreDocuments,
    loadingMoreDocuments,
  } = useChatDocuments();

  const catalogOptions = useMemo(
    () => catalogModelsToOptions(catalogModels, selectedProvider),
    [catalogModels, selectedProvider]
  );

  // Prefer live Ollama tags when available; otherwise Settings catalog.
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

  const {
    streaming,
    streamedText,
    error,
    setError,
    sendMessage,
    stopStreaming,
  } = useChatStream({
    conversationId,
    onNewMessage,
    selectedModel: activeModel,
    selectedProvider,
    temperature,
    maxTokens,
    selectedDocIds,
    attachedImage,
    setAttachedImage,
  });

  const { messages, setMessages, loading } = useConversationHistory(
    conversationId,
    setError
  );

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

  const [settingsSnapshot, setSettingsSnapshot] = useState<
    UserSettings | undefined
  >(undefined);

  if (settings !== settingsSnapshot) {
    setSettingsSnapshot(settings);
    if (settings) {
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
  }

  // Side-effect only: discover Ollama tags when settings say ollama.
  useEffect(() => {
    if (settings?.default_provider !== 'ollama') return;
    const host = settings.default_ollama_host;
    let cancelled = false;
    void (async () => {
      try {
        const response = await modelsAPI.getRemote('ollama', host);
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
  }, [settings?.default_provider, settings?.default_ollama_host]);

  const scrollToBottom = useCallback(() => {
    if (
      messagesEndRef.current &&
      typeof messagesEndRef.current.scrollIntoView === 'function'
    ) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamedText, scrollToBottom]);

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
  const copyMessage = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Скопійовано! 📋', { autoClose: 1500 });
  }, []);

  const exportChatToMarkdown = useCallback(async () => {
    if (!conversationId && messages.length === 0) {
      toast.warn('Немає повідомлень для експорту.');
      return;
    }
    try {
      if (conversationId) {
        const res = await conversationAPI.export(conversationId, 'md');
        const { content, filename } = res.data;
        const blob = new Blob([content], {
          type: 'text/markdown;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `chat-export-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const header = `# Експорт чату — ${new Date().toLocaleDateString('uk-UA')}\n\n`;
        const body = messages
          .map(
            (m) =>
              `## ${m.role === 'user' ? '👤 Ви' : '🤖 Assistant'}\n\n${m.content}`
          )
          .join('\n\n---\n\n');
        const blob = new Blob([header + body], {
          type: 'text/markdown;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-export-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success('Чат експортовано у Markdown! 📄');
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка експорту');
    }
  }, [conversationId, messages]);

  const handleImageAttach = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Будь ласка, оберіть зображення (JPG, PNG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachedImage({
        url: URL.createObjectURL(file),
        base64: String(ev.target?.result || ''),
      });
      toast.info('🖼️ Зображення додано до повідомлення!');
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  const clearAttachedImage = useCallback(() => {
    if (attachedImage?.url) URL.revokeObjectURL(attachedImage.url);
    setAttachedImage(null);
  }, [attachedImage]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || streaming || loading) return;
    const userContent = inputMessage.trim();
    setInputMessage('');
    await sendMessage(userContent, setMessages);
  };

  return (
    <div
      className="glass-panel p-3 d-flex flex-column"
      style={{ height: 'calc(100vh - 120px)' }}
    >
      <ChatControls
        selectedProvider={selectedProvider}
        onProviderChange={handleProviderChange}
        selectedModel={activeModel}
        onModelChange={setSelectedModel}
        availableModels={availableModels}
        temperature={temperature}
        onTemperatureChange={setTemperature}
        selectedDocIds={selectedDocIds}
        streaming={streaming}
        onShowPromptModal={() => setShowPromptModal(true)}
        onShowDocModal={() => setShowDocModal(true)}
        onExportChat={exportChatToMarkdown}
        messagesCount={messages.length}
      />

      {error && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => setError(null)}
          className="py-2"
        >
          {error}
        </Alert>
      )}

      <MessageList
        messages={messages}
        loading={loading}
        streaming={streaming}
        streamedText={streamedText}
        speakingIdx={speakingIdx}
        onSpeak={speakText}
        onCopy={copyMessage}
        messagesEndRef={messagesEndRef}
      />

      <MessageInput
        inputMessage={inputMessage}
        onInputChange={setInputMessage}
        onSubmit={handleSendMessage}
        isListening={isListening}
        onToggleListening={toggleListening}
        streaming={streaming}
        onStop={stopStreaming}
        attachedImage={attachedImage}
        onClearImage={clearAttachedImage}
        onAttachImage={() =>
          imageInputRef.current && imageInputRef.current.click()
        }
        supportsVision={modelSupportsVision(activeModel, catalogModels)}
      />

      <input
        type="file"
        ref={imageInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageAttach}
      />

      <DocumentModal
        show={showDocModal}
        onHide={() => setShowDocModal(false)}
        userDocuments={userDocuments}
        selectedDocIds={selectedDocIds}
        onToggleDoc={handleToggleDoc}
        onDeleteDoc={handleDeleteDoc}
        onRetryDoc={handleRetryDoc}
        retryingDocId={retryingDocId}
        onUploadClick={() =>
          fileInputRef.current && fileInputRef.current.click()
        }
        uploadingDoc={uploadingDoc}
        fileInputRef={fileInputRef}
        onFileChange={handleFileUpload}
        hasMore={hasMoreDocuments}
        onLoadMore={loadMoreDocuments}
        loadingMore={loadingMoreDocuments}
        hasOpenaiApiKey={Boolean(settings?.has_openai_api_key)}
      />

      <PromptLibraryModal
        show={showPromptModal}
        onHide={() => setShowPromptModal(false)}
        onSelectPrompt={async (promptText: string) => {
          try {
            await updateSettings.mutateAsync({ system_prompt: promptText });
            toast.success('Нову роль AI успішно встановлено! 💡');
          } catch (e: unknown) {
            const ax = e as AxiosError<{
              error?: string;
              errors?: Array<{ msg?: string }>;
            }> & { message?: string };
            const msg =
              ax?.response?.data?.error ||
              ax?.response?.data?.errors?.[0]?.msg ||
              ax?.message ||
              'невідома помилка';
            toast.error(`Помилка збереження ролі: ${msg}`);
            throw e;
          }
        }}
      />
    </div>
  );
};

export default React.memo(ChatBoxOptimized);
