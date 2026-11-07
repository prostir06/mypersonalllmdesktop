import React, { useCallback, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { Row, Col } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import ChatBoxOptimized from '../components/ChatBoxOptimized';
import ConfirmModal from '../components/ConfirmModal';
import {
  useAutoSelectConversation,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useInvalidateConversations,
  useRenameConversation,
  useTogglePinConversation,
} from '../hooks/useConversations';
import { isSameConversation } from './dashboard/isSameConversation';
import DashboardSidebar from './dashboard/DashboardSidebar';
import NewConversationModal from './dashboard/NewConversationModal';

function conversationIdFromSearch(
  searchParams: URLSearchParams
): number | null {
  const cid = searchParams.get('conversation');
  if (cid && /^\d+$/.test(cid)) return Number(cid);
  return null;
}

const Dashboard: React.FC = () => {
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [newConvTitle, setNewConvTitle] = useState('');
  const [renamingId, setRenamingId] = useState<string | number | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // URL is the source of truth — avoids syncing searchParams into state via effect.
  const activeConversation = useMemo(
    () => conversationIdFromSearch(searchParams),
    [searchParams]
  );

  const selectConversation = useCallback(
    (id: string | number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id == null) next.delete('conversation');
          else next.set('conversation', String(id));
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const {
    conversations,
    isLoading,
    hasMore,
    loadMore,
    isFetchingNextPage,
  } = useConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const renameConversation = useRenameConversation();
  const invalidateConversations = useInvalidateConversations();
  const togglePinMutation = useTogglePinConversation();

  useAutoSelectConversation(
    conversations,
    activeConversation,
    selectConversation
  );

  const handleNewConversation = useCallback(async () => {
    try {
      const created = await createConversation.mutateAsync(
        newConvTitle || 'Нова розмова'
      );
      selectConversation(created.id);
      setNewConvTitle('');
      setShowNewConvModal(false);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      toast.error('Не вдалося створити розмову');
    }
  }, [createConversation, newConvTitle, selectConversation]);

  const handleDeleteConversation = useCallback(
    (convId: string | number, e?: MouseEvent) => {
      if (e) e.stopPropagation();
      setDeleteTarget(convId);
    },
    []
  );

  const openNewConversation = useCallback(() => setShowNewConvModal(true), []);

  const onTogglePin = useCallback(
    (id: string | number, e: MouseEvent) => {
      e.stopPropagation();
      togglePinMutation.mutate(id);
    },
    [togglePinMutation]
  );

  const confirmDelete = async () => {
    if (deleteTarget == null) return;
    try {
      await deleteConversation.mutateAsync(deleteTarget);
      if (isSameConversation(activeConversation, deleteTarget)) {
        const remaining = conversations.filter((c) => c.id !== deleteTarget);
        selectConversation(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast.error('Не вдалося видалити розмову');
    } finally {
      setDeleteTarget(null);
    }
  };

  const startRename = useCallback(
    (conv: { id: string | number; title?: string }, e: MouseEvent) => {
      e.stopPropagation();
      setRenamingId(conv.id);
      setRenameTitle(conv.title || '');
    },
    []
  );

  const saveRename = useCallback(
    async (convId: string | number, e?: FormEvent | MouseEvent) => {
    e?.stopPropagation();
    const title = renameTitle.trim() || 'Новий чат';
    try {
      await renameConversation.mutateAsync({ id: convId, title });
      setRenamingId(null);
      toast.success('Назву оновлено');
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Не вдалося перейменувати');
    }
  },
    [renameConversation, renameTitle]
  );

  const onNewMessage = useCallback(
    (newId?: string | number) => {
      invalidateConversations();
      if (newId) selectConversation(newId);
    },
    [invalidateConversations, selectConversation]
  );

  return (
    <Row className="g-3" style={{ minHeight: 'calc(100vh - 100px)' }}>
      <Col md={4} lg={3}>
        <DashboardSidebar
          conversations={conversations}
          isLoading={isLoading}
          hasMore={hasMore}
          loadMore={loadMore}
          isFetchingNextPage={isFetchingNextPage}
          activeConversation={activeConversation}
          selectConversation={selectConversation}
          invalidateConversations={invalidateConversations}
          renamingId={renamingId}
          renameTitle={renameTitle}
          setRenameTitle={setRenameTitle}
          startRename={startRename}
          saveRename={saveRename}
          handleDeleteConversation={handleDeleteConversation}
          onTogglePin={onTogglePin}
          onNewConversation={openNewConversation}
        />
      </Col>

      <Col md={8} lg={9}>
        <ChatBoxOptimized
          conversationId={activeConversation}
          onNewMessage={onNewMessage}
        />
      </Col>

      <NewConversationModal
        show={showNewConvModal}
        title={newConvTitle}
        onTitleChange={setNewConvTitle}
        onHide={() => setShowNewConvModal(false)}
        onCreate={handleNewConversation}
      />

      <ConfirmModal
        show={deleteTarget != null}
        title="Видалення розмови"
        message="Ви впевнені, що хочете видалити цю розмову?"
        confirmLabel="Видалити"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Row>
  );
};

export default Dashboard;
