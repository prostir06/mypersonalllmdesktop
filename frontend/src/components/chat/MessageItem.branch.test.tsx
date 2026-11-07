import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MessageItem, { type ChatMessageView } from './MessageItem';

describe('MessageItem branch controls', () => {
  it('renders regenerate and branch switch controls when assistant branches are present', async () => {
    const user = userEvent.setup();
    const onSwitchBranch = vi.fn();
    const onRegenerate = vi.fn();
    const msg: ChatMessageView = {
      id: 1,
      role: 'assistant',
      content: 'a',
      branches: [
        { id: 1, content: 'a' },
        { id: 2, content: 'b' },
      ],
      branch_index: 0,
    };

    render(
      <MessageItem
        msg={msg}
        idx={0}
        speakingIdx={null}
        onSpeak={vi.fn()}
        onCopy={vi.fn()}
        onSwitchBranch={onSwitchBranch}
        onRegenerate={onRegenerate}
      />
    );

    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByTitle('Попередня версія')).toBeDisabled();
    expect(screen.getByTitle('Перегенерувати відповідь')).toBeInTheDocument();

    await user.click(screen.getByTitle('Наступна версія'));
    expect(onSwitchBranch).toHaveBeenCalledWith(0, 1);

    await user.click(screen.getByTitle('Перегенерувати відповідь'));
    expect(onRegenerate).toHaveBeenCalledWith(0);
  });

  it('announces a finished assistant message', () => {
    const msg: ChatMessageView = {
      id: 9,
      role: 'assistant',
      content: 'готова відповідь',
    };
    render(
      <MessageItem
        msg={msg}
        idx={3}
        speakingIdx={null}
        onSpeak={vi.fn()}
        onCopy={vi.fn()}
        announce
      />
    );
    const bubble = screen.getByText('готова відповідь').closest('.message-bubble');
    expect(bubble).toHaveAttribute('aria-live', 'polite');
  });
});
