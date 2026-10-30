import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ClaudeSettingsCard from './ClaudeSettingsCard';

describe('ClaudeSettingsCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders card with status "Не налаштовано" when has_anthropic_api_key is false', () => {
    render(
      <ClaudeSettingsCard
        has_anthropic_api_key={false}
        onSaveClaudeKey={vi.fn()}
        onClearClaudeKey={vi.fn()}
      />
    );

    expect(screen.getByText(/Anthropic Claude/i)).toBeInTheDocument();
    expect(screen.getByText('Не налаштовано')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Anthropic Console/i })).toHaveAttribute(
      'href',
      'https://console.anthropic.com/'
    );
  });

  it('renders status "Збережено" when has_anthropic_api_key is true', () => {
    render(
      <ClaudeSettingsCard
        has_anthropic_api_key={true}
        onSaveClaudeKey={vi.fn()}
        onClearClaudeKey={vi.fn()}
      />
    );

    expect(screen.getByText('Збережено')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Видалити ключ/i })).toBeInTheDocument();
  });

  it('validates key input: warns if key does not start with sk-ant-', () => {
    render(
      <ClaudeSettingsCard
        hasKey={false}
        onSaveKey={vi.fn()}
        onClearKey={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Введіть Claude API ключ/i);
    fireEvent.change(input, { target: { value: 'invalid-prefix-123' } });

    expect(screen.getByText(/повинен починатися з sk-ant-/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Зберегти ключ/i })).toBeDisabled();
  });

  it('calls onSaveClaudeKey when saving valid key', () => {
    const onSave = vi.fn();
    render(
      <ClaudeSettingsCard
        has_anthropic_api_key={false}
        onSaveClaudeKey={onSave}
        onClearClaudeKey={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Введіть Claude API ключ/i);
    fireEvent.change(input, { target: { value: 'sk-ant-api03-abcdef123456' } });

    expect(screen.queryByText(/повинен починатися з sk-ant-/i)).not.toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /Зберегти ключ/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledWith('sk-ant-api03-abcdef123456');
  });

  it('calls onClearClaudeKey when clearing key', () => {
    const onClear = vi.fn();
    render(
      <ClaudeSettingsCard
        has_anthropic_api_key={true}
        onSaveClaudeKey={vi.fn()}
        onClearClaudeKey={onClear}
      />
    );

    const clearBtn = screen.getByRole('button', { name: /Видалити ключ/i });
    fireEvent.click(clearBtn);

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('toggles password visibility between password and text', () => {
    render(
      <ClaudeSettingsCard
        hasKey={false}
        onSaveKey={vi.fn()}
        onClearKey={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Введіть Claude API ключ/i);
    expect(input).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByRole('button', { name: /Показати/i });
    fireEvent.click(toggleBtn);
    expect(input).toHaveAttribute('type', 'text');

    const hideBtn = screen.getByRole('button', { name: /Приховати/i });
    fireEvent.click(hideBtn);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('disables input and buttons when saving', () => {
    render(
      <ClaudeSettingsCard
        has_anthropic_api_key={true}
        isSaving={true}
        onSaveClaudeKey={vi.fn()}
        onClearClaudeKey={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Введіть Claude API ключ/i);
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: /Збереження.../i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Видалити ключ/i })).toBeDisabled();
  });

  it('preserves key input when handleSave rejects', async () => {
    const handleSave = vi.fn().mockRejectedValue(new Error('Network error'));
    render(
      <ClaudeSettingsCard
        hasKey={false}
        handleSave={handleSave}
        handleClear={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/sk-ant-api03-/i);
    fireEvent.change(input, { target: { value: 'sk-ant-api03-my-test-key' } });
    fireEvent.click(screen.getByRole('button', { name: /Зберегти/i }));

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith('sk-ant-api03-my-test-key');
    });

    // Input should NOT be cleared if save failed
    expect(screen.getByPlaceholderText(/sk-ant-api03-/i)).toHaveValue(
      'sk-ant-api03-my-test-key'
    );
  });
});
