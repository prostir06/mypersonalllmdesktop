import React, { type ChangeEvent, type RefObject } from 'react';
import type { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import DocumentModal from './DocumentModal';
import PromptLibraryModal from '../PromptLibraryModal';
import type { DocumentRecord } from '../../types/api';

type Props = {
  showDocModal: boolean;
  setShowDocModal: (v: boolean) => void;
  showPromptModal: boolean;
  setShowPromptModal: (v: boolean) => void;
  userDocuments: DocumentRecord[];
  selectedDocIds: Array<string | number>;
  handleToggleDoc: (docId: string | number, checked: boolean) => void;
  handleDeleteDoc: (docId: string | number) => void;
  handleRetryDoc: (docId: string | number) => void;
  handleReindexDoc: (docId: string | number) => void;
  retryingDocId?: string | number | null;
  reindexingDocId?: string | number | null;
  uploadingDoc: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  handleFileUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  hasMoreDocuments: boolean;
  loadMoreDocuments: () => void;
  loadingMoreDocuments: boolean;
  ragEmbeddingMode: 'openai' | 'ollama' | 'fallback';
  onApplySystemPrompt: (promptText: string) => Promise<void>;
};

export default function ChatBoxModals({
  showDocModal,
  setShowDocModal,
  showPromptModal,
  setShowPromptModal,
  userDocuments,
  selectedDocIds,
  handleToggleDoc,
  handleDeleteDoc,
  handleRetryDoc,
  handleReindexDoc,
  retryingDocId,
  reindexingDocId,
  uploadingDoc,
  fileInputRef,
  handleFileUpload,
  hasMoreDocuments,
  loadMoreDocuments,
  loadingMoreDocuments,
  ragEmbeddingMode,
  onApplySystemPrompt,
}: Props) {
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
      />

      <PromptLibraryModal
        show={showPromptModal}
        onHide={() => setShowPromptModal(false)}
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
