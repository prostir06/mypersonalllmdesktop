// frontend/src/components/ConversationListOptimized.js - ПРИКЛАД З ВІРТУАЛІЗАЦІЄЮ
import React, { useMemo } from 'react';
import { ListGroup, Button, Spinner } from 'react-bootstrap';
import { FixedSizeList as List } from 'react-window';
import { useConversations, useDeleteConversation } from '../hooks/useSettings';

const Row = ({ index, style, data, onDelete, activeId }) => {
  const conversation = data[index];
  return (
    <div style={style}>
      <ListGroup.Item
        className={`d-flex justify-content-between align-items-center ${
          activeId === conversation.id ? 'active' : ''
        }`}
        style={{ cursor: 'pointer' }}
      >
        <div>{conversation.title || 'Розмова'}</div>
        <Button
          variant="danger"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(conversation.id);
          }}
        >
          ✕
        </Button>
      </ListGroup.Item>
    </div>
  );
};

const ConversationListOptimized = ({ activeId, onSelect }) => {
  const { data: conversations = [], isLoading } = useConversations();
  const { mutate: deleteConversation } = useDeleteConversation();

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) =>
      new Date(b.updated_at) - new Date(a.updated_at)
    );
  }, [conversations]);

  if (isLoading) {
    return (
      <div className="text-center p-3">
        <Spinner size="sm" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return <p className="text-muted p-3">Розмови не знайдені</p>;
  }

  return (
    <List
      height={400}
      itemCount={sortedConversations.length}
      itemSize={50}
      width="100%"
      itemData={sortedConversations}
    >
      {(props) => (
        <Row
          {...props}
          onDelete={deleteConversation}
          activeId={activeId}
        />
      )}
    </List>
  );
};

export default React.memo(ConversationListOptimized);
