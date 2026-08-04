/**
 * Chat orchestrator — wires settings, stream, speech, and documents hooks.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { chatAPI, conversationAPI, modelsAPI } from '../services/api';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { useSpeech } from '../hooks/useSpeech';
import { useChatDocuments } from '../hooks/useChatDocuments';
import { useChatStream } from '../hooks/useChatStream';
import ChatControls from './chat/ChatControls';
import MessageList from './chat/MessageList';
import MessageInput from './chat/MessageInput';
import DocumentModal from './chat/DocumentModal';
import PromptLibraryModal from './PromptLibraryModal';

const MODEL_OPTIONS = {
  openai: [
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Швидка)' },
    { value: 'gpt-4', label: 'GPT-4 (Розумна)' },
    { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
    { value: 'gpt-4o', label: 'GPT-4o (Найновіша)' },
  ],
  ollama: [
    { value: 'llama2', label: 'Llama 2 (Локальна)' },
    { value: 'llama3', label: 'Llama 3 (Локальна)' },
    { value: 'mistral', label: 'Mistral (Локальна)' },
    { value: 'codellama', label: 'CodeLlama' },
  ],
};

const ChatBoxOptimized = ({ conversationId, onNewMessage }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
  const [remoteModels, setRemoteModels] = useState([]);
  const [temperature, setTemperature] = useState(0.7);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [attachedImage, setAttachedImage] = useState(null);
  const imageInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const { data: settings } = useSettings();
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
  } = useChatDocuments();

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
    selectedModel,
    selectedProvider,
    temperature,
    selectedDocIds,
    attachedImage,
    setAttachedImage,
  });

  const fetchRemoteModels = useCallback(async (hostUrl) => {
    try {
      const response = await modelsAPI.getRemote('ollama', hostUrl);
      const fetched = (response.data || []).map((m) => ({
        value: m.id || m.name,
        label: `${m.name || m.id} (Локальна)`,
      }));
      if (fetched.length > 0) setRemoteModels(fetched);
    } catch (err) {
      console.warn('Could not fetch remote Ollama models:', err.message);
    }
  }, []);

  useEffect(() => {
    if (!settings) return;
    const prov = settings.default_provider || 'openai';
    const mod = settings.default_model || 'gpt-3.5-turbo';
    const host = settings.default_ollama_host;
    setSelectedProvider(prov);
    setSelectedModel(mod);
    if (settings.temperature !== undefined) {
      setTemperature(parseFloat(settings.temperature));
    }
    if (prov === 'ollama') fetchRemoteModels(host);
  }, [settings, fetchRemoteModels]);

  useEffect(() => {
    if (conversationId) {
      (async () => {
        try {
          setLoading(true);
          setError(null);
          const response = await chatAPI.getHistory(conversationId);
          const history = response.data.messages || response.data || [];
          setMessages(history);
        } catch {
          setError('Не вдалося завантажити історію повідомлень');
        } finally {
          setLoading(false);
        }
      })();
    } else {
      setMessages([]);
    }
  }, [conversationId, setError]);

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

  const availableModels = useMemo(() => {
    let list =
      selectedProvider === 'ollama' && remoteModels.length > 0
        ? remoteModels
        : MODEL_OPTIONS[selectedProvider] || MODEL_OPTIONS.openai;
    if (selectedModel && !list.some((m) => m.value === selectedModel)) {
      list = [
        { value: selectedModel, label: `${selectedModel} (Обрана)` },
        ...list,
      ];
    }
    return list;
  }, [selectedProvider, remoteModels, selectedModel]);

  const handleProviderChange = useCallback(
    (e) => {
      const provider = e.target.value;
      setSelectedProvider(provider);
      if (provider === 'ollama') fetchRemoteModels();
      const models =
        provider === 'ollama' && remoteModels.length > 0
          ? remoteModels
          : MODEL_OPTIONS[provider] || MODEL_OPTIONS.openai;
      if (models.length > 0) setSelectedModel(models[0].value);
    },
    [remoteModels, fetchRemoteModels]
  );

  const copyMessage = useCallback((text) => {
    navigator.clipboard.writeText(text);
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
    } catch (err) {
      toast.error(err.response?.data?.error || 'Помилка експорту');
    }
  }, [conversationId, messages]);

  const handleImageAttach = useCallback((e) => {
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
        base64: ev.target.result,
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

  const handleSendMessage = async (e) => {
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
        selectedModel={selectedModel}
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
        supportsVision={
          selectedModel?.includes('gpt-4') || selectedModel?.includes('gpt-4o')
        }
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
        onUploadClick={() =>
          fileInputRef.current && fileInputRef.current.click()
        }
        uploadingDoc={uploadingDoc}
        fileInputRef={fileInputRef}
        onFileChange={handleFileUpload}
      />

      <PromptLibraryModal
        show={showPromptModal}
        onHide={() => setShowPromptModal(false)}
        onSelectPrompt={async (promptText) => {
          try {
            await updateSettings.mutateAsync({ system_prompt: promptText });
            toast.success('Нову роль AI успішно встановлено! 💡');
          } catch (e) {
            const msg =
              e?.response?.data?.error ||
              e?.response?.data?.errors?.[0]?.msg ||
              e?.message ||
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
