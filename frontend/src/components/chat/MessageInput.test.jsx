import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageInput from './MessageInput';

const baseProps = {
  inputMessage: 'hi',
  onInputChange: vi.fn(),
  onSubmit: vi.fn((e) => e?.preventDefault?.()),
  isListening: false,
  onToggleListening: vi.fn(),
  attachedImage: null,
  onClearImage: vi.fn(),
  onAttachImage: vi.fn(),
  supportsVision: false,
};

describe('MessageInput', () => {
  it('calls onStop when Stop is clicked while streaming', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();

    render(
      <MessageInput {...baseProps} streaming onStop={onStop} />
    );

    await user.click(screen.getByRole('button', { name: /stop/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
