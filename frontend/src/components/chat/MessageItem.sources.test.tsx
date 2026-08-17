import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MessageItem from './MessageItem';

describe('MessageItem sources', () => {
  it('renders MessageSources when assistant message has persisted sources', () => {
    render(
      <MessageItem
        msg={{
          role: 'assistant',
          content: 'Answer with RAG',
          sources: [{ filename: 'notes.txt', similarity: 0.88 }],
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );

    expect(screen.getByText('Джерела')).toBeInTheDocument();
    expect(screen.getByText('notes.txt (88%)')).toBeInTheDocument();
  });
});
