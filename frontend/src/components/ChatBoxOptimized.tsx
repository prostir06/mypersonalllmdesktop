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
import { conversationAPI, modelsAPI, chatAPI } from '../services/api';
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
import type { UserSettings, ChatAttachmentPayload, Message } from '../types/api';
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
  const [chatAttachments, setChatAttachments] = useState<
    ChatAttachmentPayload[]
  >([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
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
    handleReindexDoc,
    retryingDocId,
    reindexingDocId,
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
    regenerateMessage,
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
    chatAttachments,
    setChatAttachments,
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

  const settingsFingerprint = settings
    ? `${settings.default_provider}|${settings.default_model}|${settings.temperature}|${settings.max_tokens}`
    : '';

  useEffect(() => {
    if (!settings) return;
    setSelectedProvider(settings.default_provider || 'openai');
    setSelectedModel(settings.default_model || '');
    if (settings.temperature !== undefined) {
      setTemperature(parseFloat(String(settings.temperature)));
    }
    if (settings.max_tokens !== undefined) {
      const n = parseInt(String(settings.max_tokens), 10);
      if (Number.isFinite(n) && n > 0) setMaxTokens(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsFingerprint]);

  useEffect(() => {
    if (settings?.default_provider !== 'ollama') return;
    void fetchRemoteModels(settings.default_ollama_host);
  }, [settings?.default_provider, settings?.default_ollama_host, fetchRemoteModels]);

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

  const handleFileAttach = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const allowed = /\.(pdf|txt|md)$/i.test(file.name) ||
        ['application/pdf', 'text/plain', 'text/markdown'].includes(file.type);
      if (!allowed) {
        toast.error('Дозволено лише PDF, TXT, MD');
        return;
      }
      if (chatAttachments.length >= 5) {
        toast.warn('Максимум 5 вкладень на повідомлення');
        return;
      }
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await chatAPI.uploadAttachment(formData);
        setChatAttachments((prev) => [
          ...prev,
          { filename: res.data.filename, content: res.data.content },
        ]);
        toast.success(
          res.data.truncated
            ? `Файл додано (обрізано до ${res.data.chars} символів)`
            : 'Файл додано до повідомлення'
        );
      } catch (err: unknown) {
        const ax = err as AxiosError<{ error?: string }>;
        toast.error(ax.response?.data?.error || 'Помилка обробки файлу');
      }
      if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    },
    [chatAttachments.length]
  );

  const handleRegenerate = useCallback(
    async (assistantIdx: number) => {
      const assistant = messages[assistantIdx];
      if (!assistant || assistant.role !== 'assistant') return;
      let userMsg: Message | undefined;
      for (let i = assistantIdx - 1; i >= 0; i--) {
        if (messages[i]?.role === 'user') {
          userMsg = messages[i];
          break;
        }
      }
      if (!userMsg?.id) {
        toast.warn('Неможливо перегенерувати — оновіть історію чату');
        return;
      }
      await regenerateMessage(userMsg, assistantIdx, setMessages);
    },
    [messages, regenerateMessage, setMessages]
  );

  const handleSwitchBranch = useCallback(
    (assistantIdx: number, branchIdx: number) => {
      setMessages((prev) => {
        const msg = prev[assistantIdx];
        if (!msg?.branches?.length) return prev;
        const branch = msg.branches[branchIdx];
        if (!branch) return prev;
        const next = [...prev];
        next[assistantIdx] = {
          ...msg,
          content: branch.content,
          id: branch.id,
          branch_index: branchIdx,
        };
        return next;
      });
    },
    [setMessages]
  );

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (
      (!inputMessage.trim() && chatAttachments.length === 0) ||
      streaming ||
      loading
    ) {
      return;
    }
    const userContent =
      inputMessage.trim() ||
      'Проаналізуй вкладені файли та відповідай на основі їхнього вмісту.';
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
        onRegenerate={handleRegenerate}
        onSwitchBranch={handleSwitchBranch}
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
        chatAttachments={chatAttachments}
        onRemoveAttachment={(i) =>
          setChatAttachments((prev) => prev.filter((_, idx) => idx !== i))
        }
        onAttachFile={() =>
          chatFileInputRef.current && chatFileInputRef.current.click()
        }
        supportsVision={modelSupportsVision(activeModel, catalogModels)}
      />

      <input
        type="file"
        ref={chatFileInputRef}
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        style={{ display: 'none' }}
        onChange={handleFileAttach}
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
        onReindexDoc={handleReindexDoc}
        retryingDocId={retryingDocId}
        reindexingDocId={reindexingDocId}
        onUploadClick={() =>
          fileInputRef.current && fileInputRef.current.click()
        }
        uploadingDoc={uploadingDoc}
        fileInputRef={fileInputRef}
        onFileChange={handleFileUpload}
        hasMore={hasMoreDocuments}
        onLoadMore={loadMoreDocuments}
        loadingMore={loadingMoreDocuments}
        ragEmbeddingMode={
          settings?.rag_embedding_mode ||
          (settings?.has_openai_api_key ? 'openai' : 'fallback')
        }
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
