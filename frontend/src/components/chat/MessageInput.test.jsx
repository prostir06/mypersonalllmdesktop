import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageInput from './MessageInput';

const baseProps = {
  inputMessage: 'hi',
  onInputChange: vi.fn(),
  onSubmit: vi.fn((e) => e?.preventDefault?.()),
  isListening: false,
  onToggleListening: vi.fn(),
  streaming: false,
  onStop: vi.fn(),
  attachedImage: null,
  onClearImage: vi.fn(),
  onAttachImage: vi.fn(),
  chatAttachments: [],
  onRemoveAttachment: vi.fn(),
  onAttachFile: vi.fn(),
  supportsVision: false,
};

describe('MessageInput', () => {
  afterEach(() => cleanup());

  it('calls onStop when localized stop is clicked while streaming', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();

    render(<MessageInput {...baseProps} streaming onStop={onStop} />);

    await user.click(screen.getByRole('button', { name: /зупинити генерацію/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('enables submit for image-only message', () => {
    render(
      <MessageInput
        {...baseProps}
        inputMessage="   "
        supportsVision
        attachedImage={{ url: 'blob:test', base64: 'abc' }}
      />
    );

    expect(screen.getByRole('button', { name: /надіслати/i })).toBeEnabled();
  });

  it('adds aria-labels for icon-only actions', () => {
    render(
      <MessageInput
        {...baseProps}
        supportsVision
        attachedImage={{ url: 'blob:test', base64: 'abc' }}
        chatAttachments={[{ filename: 'plan.pdf', mime_type: 'application/pdf', size: 10 }]}
      />
    );

    expect(screen.getByRole('button', { name: 'Додати зображення' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Додати файл' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Увімкнути голосове введення' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Видалити зображення' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Видалити вкладення plan.pdf' })).toBeInTheDocument();
  });

  it('renders web search toggle button when provider is gemini', async () => {
    const user = userEvent.setup();
    const onToggleWebSearch = vi.fn();

    render(
      <MessageInput
        {...baseProps}
        isGeminiProvider
        webSearchEnabled={false}
        onToggleWebSearch={onToggleWebSearch}
      />
    );

    const webSearchBtn = screen.getByRole('button', { name: /Перемикач пошуку в інтернеті/i });
    expect(webSearchBtn).toBeEnabled();
    expect(webSearchBtn).toHaveAttribute('title', 'Увімкнути веб-пошук (Google Search Grounding)');

    await user.click(webSearchBtn);
    expect(onToggleWebSearch).toHaveBeenCalledTimes(1);
  });

  it('disables web search toggle button when provider is not gemini', () => {
    render(
      <MessageInput
        {...baseProps}
        isGeminiProvider={false}
        webSearchEnabled={false}
      />
    );

    const webSearchBtn = screen.getByRole('button', { name: /Перемикач пошуку в інтернеті/i });
    expect(webSearchBtn).toBeDisabled();
    expect(webSearchBtn).toHaveAttribute('title', 'Веб-пошук доступний для Google Gemini');
  });

  it('shows active title on web search toggle button when enabled', () => {
    render(
      <MessageInput
        {...baseProps}
        isGeminiProvider
        webSearchEnabled={true}
      />
    );

    const webSearchBtn = screen.getByRole('button', { name: /Перемикач пошуку в інтернеті/i });
    expect(webSearchBtn).toHaveAttribute('title', 'Вимкнути веб-пошук');
  });
});
