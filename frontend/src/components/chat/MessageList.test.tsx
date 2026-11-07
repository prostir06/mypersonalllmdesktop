import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MessageList from './MessageList';

const baseProps = {
  messages: [] as [],
  loading: false,
  streaming: false,
  streamedText: '',
  speakingIdx: null,
  onSpeak: vi.fn(),
  onCopy: vi.fn(),
};

describe('MessageList', () => {
  it('empty state does not mention role picker', () => {
    render(<MessageList {...baseProps} />);
    expect(screen.getByText(/Введіть запитання/i)).toBeInTheDocument();
    expect(screen.queryByText(/роль AI/i)).not.toBeInTheDocument();
  });

  it('renders the unfinished stream tail as plain text', () => {
    render(
      <MessageList
        {...baseProps}
        streaming
        streamedText={'Готовий абзац\n\n**ще не готово**'}
        messages={[{ role: 'user', content: 'привіт' }]}
      />
    );
    expect(screen.getByText('**ще не готово**')).toBeInTheDocument();
    expect(screen.getByText('Готовий абзац')).toBeInTheDocument();
  });
});
