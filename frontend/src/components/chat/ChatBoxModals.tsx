import React, { type ChangeEvent, type RefObject } from 'react';
import type { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import { useChatSession } from '../../context/ChatSessionContext';
import DocumentModal from './DocumentModal';
import PromptLibraryModal from '../PromptLibraryModal';
import type { DocumentRecord } from '../../types/api';

type Props = {
  showDocModal?: boolean;
  setShowDocModal?: (v: boolean) => void;
  showPromptModal: boolean;
  setShowPromptModal: (v: boolean) => void;
  userDocuments?: DocumentRecord[];
  selectedDocIds?: Array<string | number>;
  handleToggleDoc?: (docId: string | number, checked: boolean) => void;
  handleDeleteDoc?: (docId: string | number) => void;
  handleRetryDoc?: (docId: string | number) => void;
  handleReindexDoc?: (docId: string | number) => void;
  retryingDocId?: string | number | null;
  reindexingDocId?: string | number | null;
  uploadingDoc?: boolean;
  fileInputRef?: RefObject<HTMLInputElement>;
  handleFileUpload?: (e: ChangeEvent<HTMLInputElement>) => void;
  hasMoreDocuments?: boolean;
  loadMoreDocuments?: () => void;
  loadingMoreDocuments?: boolean;
  ragEmbeddingMode: 'openai' | 'ollama' | 'fallback';
  onApplySystemPrompt: (promptText: string) => Promise<void>;
  onPromptsChanged?: () => void;
  onOpenInArtifact?: (doc: DocumentRecord) => void;
  onOpenDocInArtifact?: (doc: DocumentRecord) => void;
  openingDocId?: string | number | null;
};

export default function ChatBoxModals(props: Props) {
  const session = useChatSession();
  const documents = session?.documents;
  const showDocModal = documents?.showDocModal ?? props.showDocModal ?? false;
  const setShowDocModal = documents?.setShowDocModal ?? props.setShowDocModal ?? (() => {});
  const userDocuments = documents?.userDocuments ?? props.userDocuments ?? [];
  const selectedDocIds = documents?.selectedDocIds ?? props.selectedDocIds ?? [];
  const handleToggleDoc = documents?.handleToggleDoc ?? props.handleToggleDoc ?? (() => {});
  const handleDeleteDoc = documents?.handleDeleteDoc ?? props.handleDeleteDoc ?? (() => {});
  const handleRetryDoc = documents?.handleRetryDoc ?? props.handleRetryDoc ?? (() => {});
  const handleReindexDoc = documents?.handleReindexDoc ?? props.handleReindexDoc ?? (() => {});
  const retryingDocId = documents?.retryingDocId ?? props.retryingDocId;
  const reindexingDocId = documents?.reindexingDocId ?? props.reindexingDocId;
  const uploadingDoc = documents?.uploadingDoc ?? props.uploadingDoc ?? false;
  const fileInputRef = documents?.fileInputRef ?? props.fileInputRef ?? { current: null };
  const handleFileUpload = documents?.handleFileUpload ?? props.handleFileUpload ?? (() => {});
  const hasMoreDocuments = documents?.hasMoreDocuments ?? props.hasMoreDocuments ?? false;
  const loadMoreDocuments = documents?.loadMoreDocuments ?? props.loadMoreDocuments ?? (() => {});
  const loadingMoreDocuments = documents?.loadingMoreDocuments ?? props.loadingMoreDocuments ?? false;
  const {
    showPromptModal,
    setShowPromptModal,
    ragEmbeddingMode,
    onApplySystemPrompt,
    onPromptsChanged,
  } = props;
  return (
    <>
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
        ragEmbeddingMode={ragEmbeddingMode}
        onOpenInArtifact={props.onOpenInArtifact || props.onOpenDocInArtifact}
        openingDocId={props.openingDocId}
      />

      <PromptLibraryModal
        show={showPromptModal}
        onHide={() => setShowPromptModal(false)}
        onPromptsChanged={onPromptsChanged}
        onSelectPrompt={async (promptText: string) => {
          try {
            await onApplySystemPrompt(promptText);
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
    </>
  );
}
