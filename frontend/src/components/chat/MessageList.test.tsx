import React, { createRef } from 'react';
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
  messagesEndRef: createRef<HTMLDivElement>(),
};

describe('MessageList', () => {
  it('empty state does not mention role picker', () => {
    render(<MessageList {...baseProps} />);
    expect(screen.getByText(/Введіть запитання/i)).toBeInTheDocument();
    expect(screen.queryByText(/роль AI/i)).not.toBeInTheDocument();
  });
});
