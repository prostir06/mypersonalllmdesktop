import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatBoxOptimized from './ChatBoxOptimized';

const settingsData = {
  default_provider: 'openai',
  default_model: 'gpt-4o-mini',
  temperature: 0.5,
};

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    data: settingsData,
  }),
  useUpdateSettings: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../hooks/useModels', () => ({
  useModels: () => ({
    data: [
      {
        id: 1,
        name: 'GPT-4o mini',
        model_id: 'gpt-4o-mini',
        provider: 'openai',
        supports_vision: true,
      },
      {
        id: 2,
        name: 'llama3',
        model_id: 'llama3',
        provider: 'ollama',
        supports_vision: false,
      },
    ],
  }),
}));

vi.mock('../hooks/useSpeech', () => ({
  useSpeech: () => ({
    isListening: false,
    speakingIdx: null,
    toggleListening: vi.fn(),
    speakText: vi.fn(),
  }),
}));

vi.mock('../hooks/useChatDocuments', () => ({
  useChatDocuments: () => ({
    userDocuments: [],
    selectedDocIds: [],
    showDocModal: false,
    setShowDocModal: vi.fn(),
    uploadingDoc: false,
    fileInputRef: { current: null },
    handleFileUpload: vi.fn(),
    handleToggleDoc: vi.fn(),
    handleDeleteDoc: vi.fn(),
    handleRetryDoc: vi.fn(),
    handleReindexDoc: vi.fn(),
    retryingDocId: null,
    reindexingDocId: null,
    hasMoreDocuments: false,
    loadMoreDocuments: vi.fn(),
    loadingMoreDocuments: false,
  }),
}));

vi.mock('../hooks/useChatStream', () => ({
  useChatStream: () => ({
    streaming: false,
    streamedText: '',
    error: null,
    setError: vi.fn(),
    sendMessage: vi.fn(),
    stopStreaming: vi.fn(),
  }),
}));

vi.mock('../hooks/useConversationHistory', () => ({
  useConversationHistory: () => ({
    messages: [],
    setMessages: vi.fn(),
    loading: false,
  }),
}));

vi.mock('./chat/DocumentModal', () => ({
  default: () => null,
}));

vi.mock('./PromptLibraryModal', () => ({
  default: () => null,
}));

vi.mock('../services/api', () => ({
  conversationAPI: { export: vi.fn() },
  modelsAPI: { getRemote: vi.fn().mockResolvedValue({ data: [] }) },
}));

describe('ChatBoxOptimized', () => {
  it('shows catalog model for provider and switches to ollama catalog', async () => {
    const user = userEvent.setup();
    render(<ChatBoxOptimized conversationId={null} />);

    const modelSelect = screen.getByLabelText(/Модель AI/i);
    expect(modelSelect).toHaveValue('gpt-4o-mini');
    expect(screen.getByRole('option', { name: 'GPT-4o mini' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Провайдер AI/i), 'ollama');
    expect(screen.getByLabelText(/Модель AI/i)).toHaveValue('llama3');
    expect(screen.getByRole('option', { name: 'llama3' })).toBeInTheDocument();
  });
});
