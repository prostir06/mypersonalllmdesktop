import React, { type FormEvent, type MouseEvent } from 'react';
import { Button, Form, Spinner } from 'react-bootstrap';
import MessageSearch from '../../components/MessageSearch';
import { isSameConversation } from './isSameConversation';

type Conversation = { id: string | number; title?: string };

type Props = {
  conversations: Conversation[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  isFetchingNextPage: boolean;
  activeConversation: string | number | null;
  selectConversation: (id: string | number | null) => void;
  invalidateConversations: () => void;
  renamingId: string | number | null;
  renameTitle: string;
  setRenameTitle: (v: string) => void;
  startRename: (conv: Conversation, e: MouseEvent) => void;
  saveRename: (convId: string | number, e?: FormEvent | MouseEvent) => void;
  handleDeleteConversation: (convId: string | number, e?: MouseEvent) => void;
  onNewConversation: () => void;
};

export default function DashboardSidebar({
  conversations,
  isLoading,
  hasMore,
  loadMore,
  isFetchingNextPage,
  activeConversation,
  selectConversation,
  invalidateConversations,
  renamingId,
  renameTitle,
  setRenameTitle,
  startRename,
  saveRename,
  handleDeleteConversation,
  onNewConversation,
}: Props) {
  return (
    <div className="sidebar-wrapper glass-panel">
      <Button
        className="btn-accent w-100 mb-3 py-2.5 d-flex align-items-center justify-content-center gap-2"
        onClick={onNewConversation}
      >
        <span>➕</span> Нова розмова
      </Button>

      <MessageSearch
        onSelectConversation={(id: string | number) => {
          selectConversation(id);
          invalidateConversations();
        }}
      />

      <div
        className="flex-grow-1 overflow-auto pr-1"
        role="listbox"
        aria-label="Список розмов"
      >
        {isLoading && conversations.length === 0 ? (
          <div className="text-center p-4" aria-live="polite" aria-busy="true">
            <Spinner animation="border" size="sm" variant="primary" />
            <div className="small text-muted mt-2">Завантаження розмов…</div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-muted p-4">
            <small>Немає збережених розмов</small>
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = isSameConversation(activeConversation, conv.id);
            return (
              <div
                key={conv.id}
                role="option"
                aria-selected={isActive}
                tabIndex={0}
                className={`conversation-card ${isActive ? 'active' : ''}`}
                onClick={() => selectConversation(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectConversation(conv.id);
                  }
                }}
              >
                {renamingId === conv.id ? (
                  <Form
                    className="d-flex gap-1 flex-grow-1 me-1"
                    onClick={(e) => e.stopPropagation()}
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveRename(conv.id, e);
                    }}
                  >
                    <Form.Control
                      size="sm"
                      value={renameTitle}
                      onChange={(e) => setRenameTitle(e.target.value)}
                      autoFocus
                      className="bg-dark text-light border-secondary shadow-none"
                    />
                    <Button type="submit" size="sm" variant="success">
                      ✓
                    </Button>
                  </Form>
                ) : (
                  <div className="text-truncate me-2 fw-medium flex-grow-1">
                    💬 {conv.title || 'Новий чат'}
                  </div>
                )}
                <div className="d-flex gap-1">
                  {renamingId !== conv.id && (
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-muted text-decoration-none"
                      onClick={(e) => startRename(conv, e)}
                      title="Перейменувати"
                    >
                      ✏️
                    </Button>
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 text-muted hover-white text-decoration-none"
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    title="Видалити розмову"
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            );
          })
        )}
        {hasMore && (
          <div className="text-center py-2">
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={isFetchingNextPage}
              onClick={() => loadMore()}
            >
              {isFetchingNextPage ? (
                <Spinner animation="border" size="sm" />
              ) : (
                'Показати ще'
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
