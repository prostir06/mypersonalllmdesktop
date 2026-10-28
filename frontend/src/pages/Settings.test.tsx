import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from './Settings';

const mutateAsync = vi.fn().mockResolvedValue({});

let settingsData = {
  default_provider: 'openai',
  default_model: 'gpt-4o-mini',
  temperature: 0.7,
  max_tokens: 2000,
  system_prompt: '',
  has_openai_api_key: false,
  has_gemini_api_key: false,
};

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    data: settingsData,
    isLoading: false,
  }),
  useUpdateSettings: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

vi.mock('../hooks/useModels', () => ({
  useModels: () => ({
    data: [
      {
        id: 1,
        name: 'GPT-4o mini',
        model_id: 'gpt-4o-mini',
        provider: 'openai',
      },
    ],
  }),
}));

vi.mock('../components/settings/ModelCatalog', () => ({
  default: () => <div>Model catalog</div>,
}));

vi.mock('../hooks/useUserMemory', () => ({
  useUserMemory: () => ({
    notes: [],
    loading: false,
    mutating: false,
    error: null,
    maxNotes: 30,
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  }),
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('Settings', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    settingsData = {
      default_provider: 'openai',
      default_model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 2000,
      system_prompt: '',
      has_openai_api_key: false,
      has_gemini_api_key: false,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('saves settings via update mutation', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    expect(screen.getByLabelText(/Основний Провайдер AI/i)).toHaveValue(
      'openai'
    );
    expect(screen.getByLabelText(/Модель за замовчуванням/i)).toHaveValue(
      'gpt-4o-mini'
    );

    await user.click(
      screen.getByRole('button', { name: /Зберегти налаштування/i })
    );

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          default_provider: 'openai',
          default_model: 'gpt-4o-mini',
        })
      );
    });
  });

  it('saves gemini api key via GeminiSettingsCard', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    const input = screen.getByPlaceholderText(/Введіть Gemini API ключ/i);
    await user.type(input, 'AIzaSy123456789');

    await user.click(screen.getByRole('button', { name: /Зберегти ключ/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        gemini_api_key: 'AIzaSy123456789',
      });
    });
  });

  it('clears gemini api key when key is configured', async () => {
    settingsData = {
      ...settingsData,
      has_gemini_api_key: true,
    };
    const user = userEvent.setup();
    render(<Settings />);

    const clearBtn = screen.getByRole('button', { name: /Видалити ключ/i });
    await user.click(clearBtn);

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        clear_gemini_api_key: true,
      });
    });
  });
});
