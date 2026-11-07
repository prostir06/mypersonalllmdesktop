import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatControls from './ChatControls';

describe('ChatControls', () => {
  afterEach(() => cleanup());

  it('renders provider/model and notifies on provider change', async () => {
    const onProviderChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatControls
        selectedProvider="openai"
        onProviderChange={onProviderChange}
        selectedModel="gpt-4"
        onModelChange={vi.fn()}
        availableModels={[{ value: 'gpt-4', label: 'GPT-4' }]}
        temperature={0.7}
        onTemperatureChange={vi.fn()}
        selectedDocIds={[]}
        streaming={false}
        onShowPromptModal={vi.fn()}
        onShowDocModal={vi.fn()}
        onExportChat={vi.fn()}
        onExportPdf={vi.fn()}
        messagesCount={0}
      />
    );

    expect(screen.getByLabelText(/Провайдер AI/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Модель AI/i)).toHaveValue('gpt-4');
    await user.selectOptions(screen.getByLabelText(/Провайдер AI/i), 'ollama');
    expect(onProviderChange).toHaveBeenCalled();
  });

  it('includes Google Gemini in provider select options', async () => {
    const onProviderChange = vi.fn();
    render(
      <ChatControls
        selectedProvider="gemini"
        onProviderChange={onProviderChange}
        selectedModel="gemini-2.0-flash"
        onModelChange={vi.fn()}
        availableModels={[{ value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }]}
        temperature={0.7}
        onTemperatureChange={vi.fn()}
        selectedDocIds={[]}
        streaming={false}
        onShowPromptModal={vi.fn()}
        onShowDocModal={vi.fn()}
        onExportChat={vi.fn()}
        onExportPdf={vi.fn()}
        messagesCount={0}
      />
    );

    const providerSelect = screen.getByLabelText(/Провайдер AI/i);
    expect(providerSelect).toHaveValue('gemini');
    expect(screen.getByRole('option', { name: /Google Gemini/i })).toBeInTheDocument();
  });

  it('includes Anthropic Claude in provider select options', async () => {
    const onProviderChange = vi.fn();
    render(
      <ChatControls
        selectedProvider="anthropic"
        onProviderChange={onProviderChange}
        selectedModel="claude-3-5-sonnet-20241022"
        onModelChange={vi.fn()}
        availableModels={[
          {
            value: 'claude-3-5-sonnet-20241022',
            label: 'Claude 3.5 Sonnet',
          },
        ]}
        temperature={0.7}
        onTemperatureChange={vi.fn()}
        selectedDocIds={[]}
        streaming={false}
        onShowPromptModal={vi.fn()}
        onShowDocModal={vi.fn()}
        onExportChat={vi.fn()}
        onExportPdf={vi.fn()}
        messagesCount={0}
      />
    );

    const providerSelect = screen.getByLabelText(/Провайдер AI/i);
    expect(providerSelect).toHaveValue('anthropic');
    expect(screen.getByRole('option', { name: /Anthropic Claude/i })).toBeInTheDocument();
  });
});
