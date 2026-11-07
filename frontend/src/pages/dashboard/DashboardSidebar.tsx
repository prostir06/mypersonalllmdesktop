import React, { useMemo, useState, type FormEvent, type HTMLAttributes, type MouseEvent } from 'react';
import { Button, Form, Spinner } from 'react-bootstrap';
import MessageSearch from '../../components/MessageSearch';
import VirtualFrame from '../../components/VirtualFrame';
import { isSameConversation } from './isSameConversation';
import type { Conversation } from '../../types/api';

type SidebarRow =
  | { key: string; kind: 'header'; label: string }
  | { key: string; kind: 'conv'; conv: Conversation }
  | { key: string; kind: 'more' };

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
  onTogglePin?: (convId: string | number, e: MouseEvent) => void;
};

const SidebarList = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function SidebarList(props, ref) {
    return <div {...props} ref={ref} role="list" aria-label="Список розмов" />;
  }
);

const SidebarRow = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function SidebarRow(props, ref) {
    return <div {...props} ref={ref} role="listitem" />;
  }
);

function DashboardSidebar({
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
  onTogglePin,
}: Props) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) =>
      Boolean(c.title && c.title.toLowerCase().includes(term))
    );
  }, [conversations, searchTerm]);

  const pinned = filteredConversations.filter((c) => Boolean(c.is_pinned));
  const others = filteredConversations.filter((c) => !c.is_pinned);

  const rows = useMemo(() => {
    const next: SidebarRow[] = [];
    const pushConv = (conv: Conversation) =>
      next.push({ key: `c-${conv.id}`, kind: 'conv', conv });
    if (pinned.length > 0) {
      next.push({ key: 'h-pinned', kind: 'header', label: '📌 Закріплені' });
      pinned.forEach(pushConv);
      if (others.length > 0) {
        next.push({ key: 'h-recent', kind: 'header', label: '💬 Нещодавні' });
        others.forEach(pushConv);
      }
    } else {
      filteredConversations.forEach(pushConv);
    }
    if (hasMore && !searchTerm.trim()) next.push({ key: 'more', kind: 'more' });
    return next;
  }, [filteredConversations, hasMore, others, pinned, searchTerm]);

  const renderCard = (conv: Conversation) => {
    const isActive = isSameConversation(activeConversation, conv.id);
    const isPinned = Boolean(conv.is_pinned);
    return (
      <div
        key={conv.id}
        aria-current={isActive ? 'true' : undefined}
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
            <Button type="submit" size="sm" variant="success" aria-label="Зберегти назву">
              <span aria-hidden="true">✓</span>
            </Button>
          </Form>
        ) : (
          <div className="text-truncate me-2 fw-medium flex-grow-1">
            💬 {conv.title || 'Новий чат'}
          </div>
        )}
        <div className="d-flex gap-1">
          <Button
            variant="link"
            size="sm"
            className="p-0 text-muted text-decoration-none"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin?.(conv.id, e);
            }}
            title={isPinned ? 'Відкріпити' : 'Закріпити'}
            aria-label={isPinned ? 'Відкріпити' : 'Закріпити'}
          >
            <span aria-hidden="true" className={isPinned ? 'opacity-100' : 'opacity-50'}>
              📌
            </span>
          </Button>
          {renamingId !== conv.id && (
            <Button
              variant="link"
              size="sm"
              className="p-0 text-muted text-decoration-none"
              onClick={(e) => startRename(conv, e)}
              title="Перейменувати"
              aria-label="Перейменувати"
            >
              <span aria-hidden="true">✏️</span>
            </Button>
          )}
          <Button
            variant="link"
            size="sm"
            className="p-0 text-muted hover-white text-decoration-none"
            onClick={(e) => handleDeleteConversation(conv.id, e)}
            title="Видалити розмову"
            aria-label="Видалити розмову"
          >
            <span aria-hidden="true">🗑️</span>
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="sidebar-wrapper glass-panel">
      <div data-tour="sidebar-search">
        <Button
          className="btn-accent w-100 mb-3 py-2.5 d-flex align-items-center justify-content-center gap-2"
          onClick={onNewConversation}
        >
          <span aria-hidden="true">➕</span> Нова розмова
        </Button>

        <MessageSearch
          onSearchChange={setSearchTerm}
          onSelectConversation={(id: string | number) => {
            selectConversation(id);
            invalidateConversations();
          }}
        />
      </div>

      <div
        className="conversation-scroll flex-grow-1 pr-1"
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
        ) : filteredConversations.length === 0 && searchTerm.trim() ? (
          <div className="text-center text-muted p-4">
            <small>Розмов не знайдено за запитом &quot;{searchTerm}&quot;</small>
          </div>
        ) : (
          <VirtualFrame
            data={rows}
            computeItemKey={(_index, row) => row.key}
            components={{ List: SidebarList, Item: SidebarRow }}
            itemContent={(_index, row) => {
              if (row.kind === 'header') {
                return (
                  <div className="small text-uppercase text-muted fw-bold px-2 py-1">
                    {row.label}
                  </div>
                );
              }
              if (row.kind === 'more') {
                return (
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
                );
              }
              return renderCard(row.conv);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default React.memo(DashboardSidebar);
