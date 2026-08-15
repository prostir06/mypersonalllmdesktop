/**
 * Chat orchestrator — wires settings, stream, speech, and documents hooks.
 */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
} from 'react';
import { Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { useSpeech } from '../hooks/useSpeech';
import { useChatDocuments } from '../hooks/useChatDocuments';
import { useChatStream } from '../hooks/useChatStream';
import { useConversationHistory } from '../hooks/useConversationHistory';
import { useChatExport } from '../hooks/useChatExport';
import { useChatAttachments } from '../hooks/useChatAttachments';
import { useChatModelSelection } from '../hooks/useChatModelSelection';
import { modelSupportsVision } from '../utils/modelSupportsVision';
import type { Message } from '../types/api';
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
  const [showPromptModal, setShowPromptModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const {
    catalogModels,
    selectedProvider,
    activeModel,
    availableModels,
    temperature,
    setTemperature,
    maxTokens,
    handleProviderChange,
    setSelectedModel,
  } = useChatModelSelection({ settings });
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
  const {
    attachedImage,
    setAttachedImage,
    chatAttachments,
    setChatAttachments,
    handleImageAttach,
    handleFileAttach,
    clearAttachedImage,
    removeAttachment,
    imageInputRef,
    chatFileInputRef,
  } = useChatAttachments();

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
  const { exportMarkdown, exportPdf } = useChatExport({ conversationId, messages });

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

  const copyMessage = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Скопійовано! 📋', { autoClose: 1500 });
  }, []);

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
        onExportChat={exportMarkdown}
        onExportPdf={exportPdf}
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
        onRemoveAttachment={removeAttachment}
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
