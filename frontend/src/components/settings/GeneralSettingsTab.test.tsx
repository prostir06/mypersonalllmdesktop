import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GeneralSettingsTab from './GeneralSettingsTab';

describe('GeneralSettingsTab token visibility toggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const defaultProps = {
    provider: 'openai',
    onProviderChange: vi.fn(),
    activeModel: 'gpt-4o',
    onModelChange: vi.fn(),
    currentModels: [],
    ollamaHost: 'http://localhost:11434',
    onOllamaHostChange: vi.fn(),
    onFetchRemoteModels: vi.fn(),
    loadingRemote: false,
    ollamaStatus: null,
    temperature: 0.7,
    onTemperatureChange: vi.fn(),
    maxTokens: 2048,
    onMaxTokensChange: vi.fn(),
    systemPrompt: '',
    onSystemPromptChange: vi.fn(),
    onSubmit: vi.fn(),
    isSaving: false,
  };

  it('renders token visibility switch checked by default', () => {
    render(<GeneralSettingsTab {...defaultProps} />);

    const toggle = screen.getByLabelText(
      'Показувати використання токенів під повідомленнями'
    );
    expect(toggle).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });

  it('toggles switch and updates localStorage', () => {
    render(<GeneralSettingsTab {...defaultProps} />);

    const toggle = screen.getByLabelText(
      'Показувати використання токенів під повідомленнями'
    );
    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem('llm_assistant_show_tokens')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(localStorage.getItem('llm_assistant_show_tokens')).toBe('true');
  });

  it('initializes as unchecked when localStorage has false', () => {
    localStorage.setItem('llm_assistant_show_tokens', 'false');

    render(<GeneralSettingsTab {...defaultProps} />);

    const toggle = screen.getByLabelText(
      'Показувати використання токенів під повідомленнями'
    );
    expect(toggle).not.toBeChecked();
  });

  it('renders autonomous tools switch checked by default with Ukrainian label and help text', () => {
    render(<GeneralSettingsTab {...defaultProps} />);

    const toolsSwitch = screen.getByLabelText(
      'Автономні інструменти (Tools & Function Calling)'
    );
    expect(toolsSwitch).toBeInTheDocument();
    expect(toolsSwitch).toBeChecked();
    expect(
      screen.getByText(
        /Дозволяє моделям автоматично виконувати безпечний пошук у документах/i
      )
    ).toBeInTheDocument();
  });

  it('toggles autonomous tools switch and notifies onToolsEnabledChange', () => {
    const onToolsEnabledChange = vi.fn();
    render(
      <GeneralSettingsTab
        {...defaultProps}
        onToolsEnabledChange={onToolsEnabledChange}
      />
    );

    const toolsSwitch = screen.getByLabelText(
      'Автономні інструменти (Tools & Function Calling)'
    );
    fireEvent.click(toolsSwitch);

    expect(toolsSwitch).not.toBeChecked();
    expect(onToolsEnabledChange).toHaveBeenCalledWith(false);

    fireEvent.click(toolsSwitch);
    expect(toolsSwitch).toBeChecked();
    expect(onToolsEnabledChange).toHaveBeenCalledWith(true);
  });

  it('respects controlled tools_enabled={false}', () => {
    render(<GeneralSettingsTab {...defaultProps} tools_enabled={false} />);

    const toolsSwitch = screen.getByLabelText(
      'Автономні інструменти (Tools & Function Calling)'
    );
    expect(toolsSwitch).not.toBeChecked();
  });
});
