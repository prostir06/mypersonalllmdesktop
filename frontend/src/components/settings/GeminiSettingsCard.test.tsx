import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import GeminiSettingsCard from './GeminiSettingsCard';

describe('GeminiSettingsCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders status and can submit new key', () => {
    const onSave = vi.fn();
    const onClear = vi.fn();
    render(
      <GeminiSettingsCard
        hasKey={false}
        saving={false}
        onSaveKey={onSave}
        onClearKey={onClear}
      />
    );

    expect(screen.getByText(/Google Gemini/i)).toBeInTheDocument();
    expect(screen.getByText(/Ключ не встановлено/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Введіть Gemini API ключ/i);
    fireEvent.change(input, { target: { value: 'AIzaSy123456789' } });
    fireEvent.click(screen.getByRole('button', { name: /Зберегти/i }));

    expect(onSave).toHaveBeenCalledWith('AIzaSy123456789');
  });

  it('renders clear button when hasKey is true and triggers onClear', () => {
    const onSave = vi.fn();
    const onClear = vi.fn();
    render(
      <GeminiSettingsCard
        hasKey={true}
        saving={false}
        onSaveKey={onSave}
        onClearKey={onClear}
      />
    );

    expect(screen.getByText(/Ключ налаштовано/i)).toBeInTheDocument();
    const clearBtn = screen.getByRole('button', { name: /Видалити ключ/i });
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('disables buttons and input when saving', () => {
    render(
      <GeminiSettingsCard
        hasKey={true}
        saving={true}
        onSaveKey={vi.fn()}
        onClearKey={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Введіть Gemini API ключ/i);
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: /Збереження.../i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Видалити ключ/i })).toBeDisabled();
  });
});
