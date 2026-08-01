/**
 * @file components/ChatBoxOptimized.js
 * Головний оркестратор чат-компонента. Управляє станом та бізнес-логікою.
 * UI-рендеринг делегується дочірнім компонентам:
 *   - ChatControls   — панель налаштувань (провайдер, модель, температура)
 *   - MessageList    — список повідомлень + typing indicator
 *   - MessageInput   — поле вводу + STT + кнопка надіслати
 *   - DocumentModal  — менеджер RAG-документів
 *   - PromptLibraryModal — бібліотека системних ролей
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { chatAPI, settingsAPI, documentsAPI, modelsAPI } from '../services/api';
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
    { value: 'gpt-4o', label: 'GPT-4o (Найновіша)' }
  ],
  ollama: [
    { value: 'llama2', label: 'Llama 2 (Локальна)' },
    { value: 'llama3', label: 'Llama 3 (Локальна)' },
    { value: 'mistral', label: 'Mistral (Локальна)' },
    { value: 'codellama', label: 'CodeLlama' }
  ]
};

const ChatBoxOptimized = ({ conversationId, onNewMessage }) => {
  // --- Стан чату ---
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [error, setError] = useState(null);

  // --- Стан моделей та налаштувань ---
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
  const [remoteModels, setRemoteModels] = useState([]);
  const [temperature, setTemperature] = useState(0.7);

  // --- Стан STT / TTS ---
  const [isListening, setIsListening] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState(null);
  const recognitionRef = useRef(null);

  // --- Стан RAG документів ---
  const [userDocuments, setUserDocuments] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [showDocModal, setShowDocModal] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // --- Стан модальних вікон ---
  const [showPromptModal, setShowPromptModal] = useState(false);

  // --- Стан Vision (зображення) ---
  const [attachedImage, setAttachedImage] = useState(null); // { url: string, base64: string }
  const imageInputRef = useRef(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // ─── Ефекти ────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSettings();
    loadDocuments();
    initSpeechRecognition();
  }, []);

  useEffect(() => {
    if (conversationId) {
      loadHistory(conversationId);
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamedText, scrollToBottom]);

  // ─── STT Ініціалізація ──────────────────────────────────────────────────────

  const initSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'uk-UA';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setIsListening(false);
      toast.info(`🎤 Голос розпізнано: "${transcript}"`);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
  };

  /** Переключення голосового запису (STT) */
  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) {
      toast.warn('Ваш браузер не підтримує Web Speech API голосового вводу');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        toast.info('🎤 Говоріть зараз...');
      } catch (e) {
        setIsListening(false);
      }
    }
  }, [isListening]);

  // ─── TTS ───────────────────────────────────────────────────────────────────

  const speakText = useCallback((text, idx) => {
    if (!('speechSynthesis' in window)) {
      toast.warn('Синтез мовлення не підтримується');
      return;
    }
    if (speakingIdx === idx) {
      window.speechSynthesis.cancel();
      setSpeakingIdx(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*`_~]/g, ''));
    utterance.lang = 'uk-UA';
    utterance.onend = () => setSpeakingIdx(null);
    utterance.onerror = () => setSpeakingIdx(null);
    setSpeakingIdx(idx);
    window.speechSynthesis.speak(utterance);
  }, [speakingIdx]);

  // ─── Завантаження даних ────────────────────────────────────────────────────

  const fetchRemoteModels = useCallback(async (hostUrl) => {
    try {
      const response = await modelsAPI.getRemote('ollama', hostUrl);
      const fetched = (response.data || []).map((m) => ({
        value: m.id || m.name,
        label: `${m.name || m.id} (Локальна)`
      }));
      if (fetched.length > 0) setRemoteModels(fetched);
    } catch (err) {
      console.warn('Could not fetch remote Ollama models:', err.message);
    }
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsAPI.get();
      if (response.data) {
        const prov = response.data.default_provider || 'openai';
        const mod = response.data.default_model || 'gpt-3.5-turbo';
        const host = response.data.default_ollama_host;
        setSelectedProvider(prov);
        setSelectedModel(mod);
        if (response.data.temperature !== undefined) {
          setTemperature(parseFloat(response.data.temperature));
        }
        if (prov === 'ollama') fetchRemoteModels(host);
      }
    } catch (err) {}
  };

  const loadDocuments = async () => {
    try {
      const res = await documentsAPI.getAll();
      setUserDocuments(res.data || []);
    } catch (err) {}
  };

  const loadHistory = async (convId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await chatAPI.getHistory(convId);
      const history = response.data.messages || response.data || [];
      setMessages(history);
    } catch (err) {
      setError('Не вдалося завантажити історію повідомлень');
    } finally {
      setLoading(false);
    }
  };

  // ─── Обробники ─────────────────────────────────────────────────────────────

  const availableModels = useMemo(() => {
    let list = selectedProvider === 'ollama' && remoteModels.length > 0
      ? remoteModels
      : (MODEL_OPTIONS[selectedProvider] || MODEL_OPTIONS.openai);
    if (selectedModel && !list.some((m) => m.value === selectedModel)) {
      list = [{ value: selectedModel, label: `${selectedModel} (Обрана)` }, ...list];
    }
    return list;
  }, [selectedProvider, remoteModels, selectedModel]);

  const handleProviderChange = useCallback((e) => {
    const provider = e.target.value;
    setSelectedProvider(provider);
    if (provider === 'ollama') fetchRemoteModels();
    const models = provider === 'ollama' && remoteModels.length > 0
      ? remoteModels
      : (MODEL_OPTIONS[provider] || MODEL_OPTIONS.openai);
    if (models.length > 0) setSelectedModel(models[0].value);
  }, [remoteModels, fetchRemoteModels]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setUploadingDoc(true);
    try {
      const res = await documentsAPI.upload(formData);
      toast.success(`📄 Файл "${file.name}" опрацьовано! Створено ${res.data.chunksCount} чанків.`);
      loadDocuments();
      if (res.data.document?.id) {
        setSelectedDocIds((prev) => [...prev, res.data.document.id]);
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Помилка завантаження файлу';
      toast.error(msg);
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleDoc = useCallback((docId, checked) => {
    setSelectedDocIds((prev) =>
      checked ? [...prev, docId] : prev.filter((id) => id !== docId)
    );
  }, []);

  const handleDeleteDoc = useCallback(async (docId) => {
    await documentsAPI.delete(docId);
    setSelectedDocIds((prev) => prev.filter((id) => id !== docId));
    loadDocuments();
    toast.info('Файл видалено.');
  }, []);

  const copyMessage = useCallback((text) => {
    navigator.clipboard.writeText(text);
    toast.success('Скопійовано! 📋', { autoClose: 1500 });
  }, []);

  /** Експорт чату в Markdown файл */
  const exportChatToMarkdown = useCallback(() => {
    if (messages.length === 0) {
      toast.warn('Немає повідомлень для експорту.');
      return;
    }
    const header = `# Експорт чату — ${new Date().toLocaleDateString('uk-UA')}\n\n`;
    const body = messages
      .map((m) => `## ${m.role === 'user' ? '👤 Ви' : '🤖 Assistant'}\n\n${m.content}`)
      .join('\n\n---\n\n');
    const markdown = header + body;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Чат експортовано у Markdown! 📄');
  }, [messages]);

  /** Обробка вибраного зображення (Vision) */
  const handleImageAttach = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Будь ласка, оберіть зображення (JPG, PNG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachedImage({ url: URL.createObjectURL(file), base64: ev.target.result });
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
    setError(null);

    setMessages((prev) => [...prev, {
      role: 'user',
      content: userContent,
      created_at: new Date().toISOString()
    }]);

    const requestOptions = {
      temperature,
      documentIds: selectedDocIds,
      ragEnabled: selectedDocIds.length > 0,
      image: attachedImage?.base64 || null
    };

    let sentOk = false;
    try {
      setStreaming(true);
      setStreamedText('');
      let currentStreamText = '';

      await chatAPI.streamMessage(
        conversationId,
        userContent,
        selectedModel,
        selectedProvider,
        requestOptions,
        (token) => {
          currentStreamText += token;
          setStreamedText(currentStreamText);
        },
        (newConvId) => {
          if (!conversationId && onNewMessage) onNewMessage(newConvId);
        }
      );

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: currentStreamText, created_at: new Date().toISOString() }
      ]);
      setStreamedText('');
      if (onNewMessage) onNewMessage();
      sentOk = true;
    } catch (err) {
      try {
        const response = await chatAPI.sendMessage(
          conversationId, userContent, selectedModel, selectedProvider, requestOptions
        );
        const data = response.data;
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.content, created_at: data.timestamp }
        ]);
        if (onNewMessage) onNewMessage(data.conversationId);
        sentOk = true;
      } catch (fallbackErr) {
        const msg = fallbackErr.response?.data?.error || fallbackErr.message;
        setError(`Не вдалося отримати відповідь від AI: ${msg}`);
      }
    } finally {
      setStreaming(false);
      setStreamedText('');
      // Не тримаємо vision-картинку для наступних повідомлень
      if (sentOk) {
        setAttachedImage((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return null;
        });
      }
    }
  };

  // ─── Рендеринг ─────────────────────────────────────────────────────────────

  return (
    <div className="glass-panel p-3 d-flex flex-column" style={{ height: 'calc(100vh - 120px)' }}>

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
        <Alert variant="danger" dismissible onClose={() => setError(null)} className="py-2">
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
        attachedImage={attachedImage}
        onClearImage={clearAttachedImage}
        onAttachImage={() => imageInputRef.current && imageInputRef.current.click()}
        supportsVision={selectedModel?.includes('gpt-4') || selectedModel?.includes('gpt-4o')}
      />

      {/* Прихований input для зображень (Vision) */}
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
        onUploadClick={() => fileInputRef.current && fileInputRef.current.click()}
        uploadingDoc={uploadingDoc}
        fileInputRef={fileInputRef}
        onFileChange={handleFileUpload}
      />

      <PromptLibraryModal
        show={showPromptModal}
        onHide={() => setShowPromptModal(false)}
        onSelectPrompt={async (promptText) => {
          try {
            await settingsAPI.update({ system_prompt: promptText });
            toast.success('Нову роль AI успішно встановлено! 💡');
          } catch (e) {
            toast.error('Помилка збереження ролі.');
          }
        }}
      />
    </div>
  );
};

export default React.memo(ChatBoxOptimized);
