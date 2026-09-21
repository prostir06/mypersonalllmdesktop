import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatBoxOptimized from './ChatBoxOptimized';

const navigateMock = vi.fn();
const chatStreamState = {
  streaming: false,
  streamedText: '',
  error: null as string | null,
  setError: vi.fn(),
  sendMessage: vi.fn(),
  regenerateMessage: vi.fn(),
  stopStreaming: vi.fn(),
};

const chatAttachmentsState = {
  attachedImage: null as { url: string; base64: string } | null,
  chatAttachments: [] as unknown[],
};

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
  useChatStream: () => chatStreamState,
}));

vi.mock('../hooks/useChatAttachments', () => ({
  useChatAttachments: () => ({
    attachedImage: chatAttachmentsState.attachedImage,
    setAttachedImage: vi.fn(),
    chatAttachments: chatAttachmentsState.chatAttachments,
    setChatAttachments: vi.fn(),
    handleImageAttach: vi.fn(),
    handleFileAttach: vi.fn(),
    clearAttachedImage: vi.fn(),
    removeAttachment: vi.fn(),
    imageInputRef: { current: null },
    chatFileInputRef: { current: null },
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
  chatAPI: { uploadAttachment: vi.fn() },
  modelsAPI: { getRemote: vi.fn().mockResolvedValue({ data: [] }) },
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('ChatBoxOptimized', () => {
  afterEach(() => {
    chatStreamState.error = null;
    chatAttachmentsState.attachedImage = null;
    chatAttachmentsState.chatAttachments = [];
    cleanup();
  });

  it('shows retry and settings quick actions for stream error', async () => {
    const user = userEvent.setup();
    chatStreamState.error = 'Помилка';
    chatStreamState.sendMessage.mockClear();
    navigateMock.mockClear();
    render(<ChatBoxOptimized conversationId={null} />);

    await user.type(screen.getByLabelText(/Введення повідомлення/i), 'hello');
    await user.click(screen.getByRole('button', { name: /надіслати/i }));
    await user.click(screen.getByRole('button', { name: 'Повторити' }));
    await user.click(screen.getByRole('button', { name: 'Перевірити налаштування' }));

    expect(chatStreamState.sendMessage).toHaveBeenNthCalledWith(
      1,
      'hello',
      expect.any(Function)
    );
    expect(chatStreamState.sendMessage).toHaveBeenNthCalledWith(
      2,
      'hello',
      expect.any(Function)
    );
    expect(navigateMock).toHaveBeenCalledWith('/settings');
  });

  it('sends attachment fallback when only attachedImage is present', async () => {
    const user = userEvent.setup();
    chatAttachmentsState.attachedImage = { url: 'blob:test', base64: 'abc' };
    chatStreamState.sendMessage.mockClear();
    render(<ChatBoxOptimized conversationId={null} />);

    await user.click(screen.getByRole('button', { name: /надіслати/i }));

    expect(chatStreamState.sendMessage).toHaveBeenCalledWith(
      'Проаналізуй вкладені файли та відповідай на основі їхнього вмісту.',
      expect.any(Function)
    );
  });

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
