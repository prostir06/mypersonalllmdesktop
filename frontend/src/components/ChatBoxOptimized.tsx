import React, { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { documentsAPI } from '../services/api';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { useSpeech } from '../hooks/useSpeech';
import { useChatDocuments } from '../hooks/useChatDocuments';
import { useChatStream } from '../hooks/useChatStream';
import { useConversationHistory } from '../hooks/useConversationHistory';
import { useChatExport } from '../hooks/useChatExport';
import { useChatAttachments } from '../hooks/useChatAttachments';
import { useChatModelSelection } from '../hooks/useChatModelSelection';
import { useSystemKnowledge } from '../hooks/useSystemKnowledge';
import { copyTextWithToast } from '../utils/clipboard';
import { useGuideModal } from '../context/GuideModalContext';
import { ChatSessionProvider } from '../context/ChatSessionContext';
import type { Artifact, Message, AdvisoryTip, DocumentRecord } from '../types/api';
import ChatControls from './chat/ChatControls';
import MessageList from './chat/MessageList';
import MessageInput from './chat/MessageInput';
import ChatHiddenFileInputs from './chat/ChatHiddenFileInputs';
import ChatBoxModals from './chat/ChatBoxModals';
import ArtifactPanel from './chat/ArtifactPanel';
import SmartAdvisoryBar from './chat/SmartAdvisoryBar';

type ChatBoxOptimizedProps = {
  conversationId?: string | number | null;
  onNewMessage?: (conversationId?: string | number) => void;
};

import { modelSupportsTools } from '../utils/modelSupportsTools';
export { modelSupportsTools };

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
  const guide = useGuideModal();
  const lastUserContentRef = useRef('');
  const updateSettings = useUpdateSettings();
  const model = useChatModelSelection({ settings });
  const {
    catalogModels,
    selectedProvider,
    activeModel,
    temperature,
    maxTokens,
  } = model;
  const { isListening, speakingIdx, toggleListening, speakText } =
    useSpeech(setInputMessage);
  const documents = useChatDocuments();
  const { selectedDocIds, setShowDocModal } = documents;
  const [openingDocId, setOpeningDocId] = useState<string | number | null>(null);

  const handleOpenDocInArtifact = useCallback(
    async (doc: DocumentRecord) => {
      try {
        setOpeningDocId(doc.id);
        const res = await documentsAPI.getContent(doc.id);
        setActiveArtifact({
          id: `doc-${doc.id}`,
          type: 'docx',
          title: doc.filename || String(doc.id),
          language: 'markdown',
          content: res.data.content,
        });
        setShowDocModal(false);
      } catch (err: unknown) {
        const ax = err as AxiosError<{ error?: string }> & { message?: string };
        const msg =
          ax?.response?.data?.error ||
          ax?.message ||
          'Не вдалося завантажити вміст документа';
        toast.error(msg);
      } finally {
        setOpeningDocId(null);
      }
    },
    [setShowDocModal]
  );

  const attachments = useChatAttachments();
  const {
    attachedImage,
    setAttachedImage,
    chatAttachments,
    setChatAttachments,
  } = attachments;

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

  useEffect(() => {
    return guide.register({
      params: {
        provider: selectedProvider,
        model: activeModel,
        selectedDocCount: selectedDocIds.length,
        webSearchEnabled,
      },
      onAskPrompt: (prompt) => setInputMessage(prompt),
      onOpenDocuments: () => setShowDocModal(true),
      onOpenPrompts: () => setShowPromptModal(true),
    });
  }, [
    activeModel,
    guide,
    selectedDocIds.length,
    selectedProvider,
    setShowDocModal,
    webSearchEnabled,
  ]);

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
    <ChatSessionProvider value={{ documents, attachments, model }}>
    <div className="glass-panel p-3 d-flex flex-column chat-panel">
      <ChatControls
        streaming={streaming}
        onShowPromptModal={() => setShowPromptModal(true)}
        onExportChat={exportMarkdown}
        onExportPdf={exportPdf}
        messagesCount={messages.length}
        conversationId={conversationId}
        onShowGuideModal={() => guide.open()}
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
          role="alert"
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
                  void sendMessage(lastUserContentRef.current, setMessages, {
                    ...sendOpts,
                    skipOptimisticUser: true,
                  });
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
          className={`d-flex flex-column flex-grow-1 overflow-hidden chat-thread ${activeArtifact ? 'chat-thread-beside-artifact' : ''}`}
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
            supportsVision={false}
            webSearchEnabled={webSearchEnabled}
            onToggleWebSearch={() => setWebSearchEnabled((prev) => !prev)}
          />
        </div>

        {activeArtifact && (
          <div className="artifact-panel-slot d-flex flex-column flex-grow-1 overflow-hidden">
            <ArtifactPanel
              artifact={activeArtifact}
              onClose={() => setActiveArtifact(null)}
            />
          </div>
        )}
      </div>

      <ChatHiddenFileInputs />

      <ChatBoxModals
        showPromptModal={showPromptModal}
        setShowPromptModal={setShowPromptModal}
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
        onOpenInArtifact={handleOpenDocInArtifact}
        openingDocId={openingDocId}
      />
    </div>
    </ChatSessionProvider>
  );
};

export default React.memo(ChatBoxOptimized);
