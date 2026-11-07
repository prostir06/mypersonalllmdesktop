import React, { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { useSpeech } from '../hooks/useSpeech';
import { useChatDocuments } from '../hooks/useChatDocuments';
import { useChatStream } from '../hooks/useChatStream';
import { useConversationHistory } from '../hooks/useConversationHistory';
import { useChatExport } from '../hooks/useChatExport';
import { useChatAttachments } from '../hooks/useChatAttachments';
import { useChatModelSelection } from '../hooks/useChatModelSelection';
import { useSystemKnowledge } from '../hooks/useSystemKnowledge';
import { modelSupportsVision } from '../utils/modelSupportsVision';
import { copyTextWithToast } from '../utils/clipboard';
import type { Artifact, Message, AdvisoryTip } from '../types/api';
import ChatControls from './chat/ChatControls';
import MessageList from './chat/MessageList';
import MessageInput from './chat/MessageInput';
import ChatHiddenFileInputs from './chat/ChatHiddenFileInputs';
import ChatBoxModals from './chat/ChatBoxModals';
import ArtifactPanel from './chat/ArtifactPanel';
import SmartAdvisoryBar from './chat/SmartAdvisoryBar';
import SystemGuideModal from './system/SystemGuideModal';

type ChatBoxOptimizedProps = {
  conversationId?: string | number | null;
  onNewMessage?: (conversationId?: string | number) => void;
};

export function modelSupportsTools(
  modelId: string | null | undefined,
  catalog: Array<{ model_id?: string; supports_tools?: boolean }> | null | undefined = [],
  provider?: string | null
): boolean {
  if (!modelId || typeof modelId !== 'string') return false;
  const row = (catalog || []).find((m) => m?.model_id === modelId);
  if (row?.supports_tools !== undefined) return Boolean(row.supports_tools);
  const p = (provider || '').trim().toLowerCase();
  if (p === 'openai' || p === 'anthropic' || p === 'gemini') return true;
  const m = modelId.trim().toLowerCase();
  return (
    m.includes('gpt') ||
    m.includes('claude') ||
    m.includes('gemini') ||
    m.includes('llama3.1') ||
    m.includes('llama3.2') ||
    m.includes('llama3.3') ||
    m.includes('qwen2.5') ||
    m.includes('qwen3') ||
    m.includes('mistral') ||
    m.includes('command-r') ||
    m.includes('gemma4') ||
    m.includes('minicpm')
  );
}

const ChatBoxOptimized: React.FC<ChatBoxOptimizedProps> = ({
  conversationId,
  onNewMessage,
}) => {
  const navigate = useNavigate();
  const [inputMessage, setInputMessage] = useState('');
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [prevConversationId, setPrevConversationId] = useState(conversationId);
  if (conversationId !== prevConversationId) {
    setPrevConversationId(conversationId);
    setActiveArtifact(null);
  }
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const { data: settings } = useSettings();
  const [toolsEnabled, setToolsEnabled] = useState<boolean>(() => {
    return settings?.tools_enabled ?? settings?.toolsEnabled ?? true;
  });
  const [toolsHydrated, setToolsHydrated] = useState(false);

  useEffect(() => {
    if (settings && !toolsHydrated) {
      if (settings.tools_enabled !== undefined) {
        setToolsEnabled(Boolean(settings.tools_enabled));
      } else if (settings.toolsEnabled !== undefined) {
        setToolsEnabled(Boolean(settings.toolsEnabled));
      }
      setToolsHydrated(true);
    }
  }, [settings, toolsHydrated]);

  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const lastUserContentRef = useRef('');
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
  const { messages, setMessages, loading } = useConversationHistory(conversationId, setError);
  const { exportMarkdown, exportPdf } = useChatExport({ conversationId, messages });

  const {
    data: systemKnowledge,
    isLoading: isLoadingKnowledge,
    isError: isKnowledgeError,
    refetch: refetchSystemKnowledge,
  } = useSystemKnowledge({
    provider: selectedProvider,
    model: activeModel,
    selectedDocCount: selectedDocIds.length,
    webSearchEnabled,
  });

  const advisoryWarningCount =
    systemKnowledge?.advisories.filter((a) => a.severity === 'warning').length ?? 0;

  const handleAdvisoryAction = useCallback(
    (tip: AdvisoryTip) => {
      switch (tip.actionType) {
        case 'navigate_settings':
          navigate(tip.actionTarget || '/settings');
          break;
        case 'open_documents':
          setShowDocModal(true);
          break;
        case 'open_prompts':
          setShowPromptModal(true);
          break;
        case 'ask_ai':
          if (tip.suggestedPrompt) {
            setInputMessage(tip.suggestedPrompt);
          }
          break;
      }
    },
    [navigate, setShowDocModal, setShowPromptModal, setInputMessage]
  );

  const copyMessage = useCallback((text: string) => {
    copyTextWithToast(text, 'Скопійовано! 📋');
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
      const regenOpts = {
        ...(webSearchEnabled ? { enableWebSearch: true } : {}),
        toolsEnabled,
      };
      await regenerateMessage(userMsg, assistantIdx, setMessages, regenOpts);
    },
    [messages, regenerateMessage, setMessages, webSearchEnabled, toolsEnabled]
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
          sources: branch.sources ?? msg.sources,
        };
        return next;
      });
    },
    [setMessages]
  );

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (
      (!inputMessage.trim() &&
        chatAttachments.length === 0 &&
        !attachedImage) ||
      streaming ||
      loading
    ) {
      return;
    }
    const userContent =
      inputMessage.trim() ||
      'Проаналізуй вкладені файли та відповідай на основі їхнього вмісту.';
    lastUserContentRef.current = userContent;
    setInputMessage('');
    const sendOpts = {
      ...(webSearchEnabled ? { enableWebSearch: true } : {}),
      toolsEnabled,
    };
    await sendMessage(userContent, setMessages, sendOpts);
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
        conversationId={conversationId}
        onShowGuideModal={() => setShowGuideModal(true)}
        advisoryWarningCount={advisoryWarningCount}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={() => setWebSearchEnabled((prev) => !prev)}
        toolsEnabled={toolsEnabled}
        onToggleTools={() => setToolsEnabled((prev) => !prev)}
        toolsSupported={modelSupportsTools(activeModel, catalogModels, selectedProvider)}
      />

      {error && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => setError(null)}
          className="py-2"
        >
          <div className="small mb-2">{error}</div>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              onClick={() => {
                if (lastUserContentRef.current && !streaming && !loading) {
                  const sendOpts = {
                    ...(webSearchEnabled ? { enableWebSearch: true } : {}),
                    toolsEnabled,
                  };
                  void sendMessage(lastUserContentRef.current, setMessages, sendOpts);
                }
              }}
            >
              Повторити
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-warning"
              onClick={() => navigate('/settings')}
            >
              Перевірити налаштування
            </button>
          </div>
        </Alert>
      )}

      <div className={`d-flex flex-grow-1 overflow-hidden ${activeArtifact ? 'flex-row gap-3' : 'flex-column'}`}>
        <div
          className={`d-flex flex-column flex-grow-1 overflow-hidden ${activeArtifact ? 'w-50' : ''}`}
          style={{ minWidth: 0 }}
        >
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
            onOpenArtifact={setActiveArtifact}
          />

          <SmartAdvisoryBar
            advisories={systemKnowledge?.advisories ?? []}
            versionHash={systemKnowledge?.versionHash}
            onAction={handleAdvisoryAction}
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
            onAttachImage={() => imageInputRef.current && imageInputRef.current.click()}
            chatAttachments={chatAttachments}
            onRemoveAttachment={removeAttachment}
            onAttachFile={() => chatFileInputRef.current && chatFileInputRef.current.click()}
            supportsVision={modelSupportsVision(activeModel, catalogModels)}
            webSearchEnabled={webSearchEnabled}
            onToggleWebSearch={() => setWebSearchEnabled((prev) => !prev)}
            isGeminiProvider={true}
          />
        </div>

        {activeArtifact && (
          <div
            className="d-flex flex-column flex-grow-1 overflow-hidden w-50"
            style={{ minWidth: 0 }}
          >
            <ArtifactPanel
              artifact={activeArtifact}
              onClose={() => setActiveArtifact(null)}
            />
          </div>
        )}
      </div>

      <ChatHiddenFileInputs
        chatFileInputRef={chatFileInputRef}
        imageInputRef={imageInputRef}
        onFileAttach={handleFileAttach}
        onImageAttach={handleImageAttach}
      />

      <ChatBoxModals
        showDocModal={showDocModal}
        setShowDocModal={setShowDocModal}
        showPromptModal={showPromptModal}
        setShowPromptModal={setShowPromptModal}
        userDocuments={userDocuments}
        selectedDocIds={selectedDocIds}
        handleToggleDoc={handleToggleDoc}
        handleDeleteDoc={handleDeleteDoc}
        handleRetryDoc={handleRetryDoc}
        handleReindexDoc={handleReindexDoc}
        retryingDocId={retryingDocId}
        reindexingDocId={reindexingDocId}
        uploadingDoc={uploadingDoc}
        fileInputRef={fileInputRef}
        handleFileUpload={handleFileUpload}
        hasMoreDocuments={hasMoreDocuments}
        loadMoreDocuments={loadMoreDocuments}
        loadingMoreDocuments={loadingMoreDocuments}
        ragEmbeddingMode={
          settings?.rag_embedding_mode ||
          (settings?.has_openai_api_key ? 'openai' : 'fallback')
        }
        onApplySystemPrompt={async (promptText) => {
          await updateSettings.mutateAsync({ system_prompt: promptText });
        }}
        onPromptsChanged={() => {
          void refetchSystemKnowledge();
        }}
      />

      <SystemGuideModal
        show={showGuideModal}
        onHide={() => setShowGuideModal(false)}
        knowledge={systemKnowledge}
        isLoading={isLoadingKnowledge}
        isError={isKnowledgeError}
        onRetry={() => void refetchSystemKnowledge()}
        onAction={handleAdvisoryAction}
        onAskPrompt={(prompt) => setInputMessage(prompt)}
      />
    </div>
  );
};

export default React.memo(ChatBoxOptimized);
