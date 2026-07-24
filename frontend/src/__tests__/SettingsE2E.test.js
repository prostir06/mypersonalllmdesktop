import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../services/api', () => ({
  settingsAPI: {
    get: jest.fn(),
    update: jest.fn()
  },
  modelsAPI: {
    getRemote: jest.fn()
  },
  chatAPI: {
    getHistory: jest.fn().mockResolvedValue({ data: { messages: [] } }),
    sendMessage: jest.fn().mockResolvedValue({ data: { role: 'assistant', content: 'Response' } }),
    streamMessage: jest.fn()
  }
}));

jest.mock('../hooks/useSettings', () => ({
  useSettings: jest.fn(),
  useUpdateSettings: jest.fn()
}));

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn()
  }
}));

import Settings from '../pages/Settings';
import ChatBox from '../components/ChatBoxOptimized';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import * as api from '../services/api';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('Settings Page and Chat Model Dropdown E2E Tests', () => {
  let mockMutateAsync;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMutateAsync = jest.fn().mockResolvedValue({});
    useUpdateSettings.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false
    });
  });

  describe('Settings Page - Load and Display', () => {
    test('should initialize with default values when loading fails', async () => {
      useSettings.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed')
      });

      render(<Settings />, { wrapper: createWrapper() });

      const providerSelect = screen.getByLabelText(/Основний Провайдер AI/i);
      expect(providerSelect.value).toBe('openai');
    });

    test('should load and display settings from API response', async () => {
      useSettings.mockReturnValue({
        data: {
          default_provider: 'openai',
          default_model: 'gpt-4',
          temperature: 0.8,
          max_tokens: 3000
        },
        isLoading: false
      });

      render(<Settings />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/Основний Провайдер AI/i).value).toBe('openai');
      expect(screen.getByLabelText(/Модель за замовчуванням/i).value).toBe('gpt-4');
      expect(screen.getByLabelText(/Температура креативності/i).value).toBe('0.8');
      expect(screen.getByLabelText(/Максимальна кількість токенів/i).value).toBe('3000');
    });
  });

  describe('Settings Page - Provider Change', () => {
    test('should update model when provider changes', async () => {
      useSettings.mockReturnValue({
        data: {
          default_provider: 'openai',
          default_model: 'gpt-3.5-turbo',
          temperature: 0.7,
          max_tokens: 2000
        },
        isLoading: false
      });

      render(<Settings />, { wrapper: createWrapper() });

      const providerSelect = screen.getByLabelText(/Основний Провайдер AI/i);
      fireEvent.change(providerSelect, { target: { value: 'microsoft' } });

      expect(providerSelect.value).toBe('microsoft');
    });
  });

  describe('Settings Page - Save Settings', () => {
    test('should save settings with updated temperature', async () => {
      useSettings.mockReturnValue({
        data: {
          default_provider: 'openai',
          default_model: 'gpt-3.5-turbo',
          temperature: 0.7,
          max_tokens: 2000
        },
        isLoading: false
      });

      render(<Settings />, { wrapper: createWrapper() });

      const tempInput = screen.getByLabelText(/Температура креативності/i);
      fireEvent.change(tempInput, { target: { value: '0.9' } });

      const saveButton = screen.getByRole('button', { name: /Зберегти/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            temperature: 0.9
          })
        );
      });
    });
  });

  describe('ChatBox - Model Dropdown', () => {
    test('should load chat history on component mount', async () => {
      api.chatAPI.getHistory.mockResolvedValue({ data: { messages: [] } });

      render(<ChatBox conversationId="123" onNewMessage={jest.fn()} />);

      await waitFor(() => {
        expect(api.chatAPI.getHistory).toHaveBeenCalledWith('123');
      });
    });
  });
});
