import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuideModalProvider } from '../context/GuideModalContext';
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
      {
        id: 3,
        name: 'Gemini 2.0 Flash',
        model_id: 'gemini-2.0-flash',
        provider: 'gemini',
        supports_vision: true,
      },
      {
        id: 4,
        name: 'Claude 3.5 Sonnet',
        model_id: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        supports_vision: true,
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

let mockMessages: Array<{
  id?: number | string;
  role: string;
  content: string;
}> = [];

vi.mock('../hooks/useConversationHistory', () => ({
  useConversationHistory: () => ({
    messages: mockMessages,
    setMessages: vi.fn(),
    loading: false,
  }),
}));

const mockKnowledgeData = {
  versionHash: 'hash-abc',
  generatedAt: '2026-10-31T12:00:00Z',
  snapshot: {
    activeProvider: 'openai',
    activeModel: 'gpt-4o-mini',
    modelSupportsVision: true,
    modelSupportsWebSearch: false,
    webSearchEnabled: false,
    configuredProviders: {
      openai: true,
      gemini: false,
      anthropic: false,
      ollamaHost: 'http://localhost:11434',
    },
    ragEmbeddingMode: 'openai' as const,
    documents: {
      total: 3,
      ready: 3,
      pending: 0,
      failed: 0,
      needsReindex: 0,
      selectedInChat: 0,
    },
    hasCustomSystemPrompt: false,
    pinnedPromptsCount: 1,
    userMemoryNotesCount: 2,
    temperature: 0.5,
    maxTokens: 2048,
  },
  advisories: [
    {
      id: 'rag_docs_ready_none_selected',
      severity: 'warning' as const,
      category: 'rag' as const,
      title: 'RAG документи доступні',
      message: 'Виберіть документи для використання.',
      actionLabel: 'Вибрати RAG',
      actionType: 'open_documents' as const,
      suggestedPrompt: 'Які документи доступні?',
    },
  ],
  cards: [],
};

const mockRefetchKnowledge = vi.fn();

vi.mock('../hooks/useSystemKnowledge', () => ({
  useSystemKnowledge: () => ({
    data: mockKnowledgeData,
    isLoading: false,
    refetch: mockRefetchKnowledge,
  }),
}));

vi.mock('./chat/DocumentModal', () => ({
  default: () => null,
}));

vi.mock('./chat/MemoryPanel', () => ({
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
    sessionStorage.clear();
    chatStreamState.error = null;
    chatAttachmentsState.attachedImage = null;
    chatAttachmentsState.chatAttachments = [];
    mockMessages = [];
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
      expect.any(Function),
      { toolsEnabled: true }
    );
    expect(chatStreamState.sendMessage).toHaveBeenNthCalledWith(
      2,
      'hello',
      expect.any(Function),
      { toolsEnabled: true }
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
      expect.any(Function),
      { toolsEnabled: true }
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

  it('enables web search toggle and passes enableWebSearch when provider is gemini', async () => {
    const user = userEvent.setup();
    chatStreamState.sendMessage.mockClear();
    render(<ChatBoxOptimized conversationId={null} />);

    await user.selectOptions(screen.getByLabelText(/Провайдер AI/i), 'gemini');
    const webSearchBtn = screen.getByRole('button', {
      name: /Перемикач пошуку в інтернеті/i,
    });
    expect(webSearchBtn).toBeEnabled();

    await user.click(webSearchBtn);
    await user.type(screen.getByLabelText(/Введення повідомлення/i), 'search query');
    await user.click(screen.getByRole('button', { name: /надіслати/i }));

    expect(chatStreamState.sendMessage).toHaveBeenCalledWith(
      'search query',
      expect.any(Function),
      { enableWebSearch: true, toolsEnabled: true }
    );
  });

  it('keeps enableWebSearch active when provider is switched (universal web search)', async () => {
    const user = userEvent.setup();
    chatStreamState.sendMessage.mockClear();
    render(<ChatBoxOptimized conversationId={null} />);

    await user.selectOptions(screen.getByLabelText(/Провайдер AI/i), 'gemini');
    const webSearchBtn = screen.getByRole('button', {
      name: /Перемикач пошуку в інтернеті/i,
    });
    await user.click(webSearchBtn);

    // Switch back to openai
    await user.selectOptions(screen.getByLabelText(/Провайдер AI/i), 'openai');
    await user.type(screen.getByLabelText(/Введення повідомлення/i), 'openai query');
    await user.click(screen.getByRole('button', { name: /надіслати/i }));

    expect(chatStreamState.sendMessage).toHaveBeenCalledWith(
      'openai query',
      expect.any(Function),
      { enableWebSearch: true, toolsEnabled: true }
    );
  });

  it('renders autonomous tools toggle in ChatControls and allows disabling tools', async () => {
    const user = userEvent.setup();
    chatStreamState.sendMessage.mockClear();
    render(<ChatBoxOptimized conversationId={null} />);

    const toolsBtn = screen.getByRole('button', {
      name: /Автономні інструменти/i,
    });
    expect(toolsBtn).toBeInTheDocument();
    expect(toolsBtn).toBeEnabled();
    expect(screen.getByText('Увімк')).toBeInTheDocument();

    // Click to toggle off
    await user.click(toolsBtn);

    await user.type(screen.getByLabelText(/Введення повідомлення/i), 'test without tools');
    await user.click(screen.getByRole('button', { name: /надіслати/i }));

    expect(chatStreamState.sendMessage).toHaveBeenCalledWith(
      'test without tools',
      expect.any(Function),
      { toolsEnabled: false }
    );
  });

  it('renders ArtifactPanel side-by-side when an artifact is active', async () => {
    const user = userEvent.setup();
    mockMessages = [
      {
        id: 101,
        role: 'assistant',
        content: 'Ось компонент:\n```html\n<!-- title: Split View Test -->\n<div id="root">Interactive Widget</div>\n```',
      },
    ];
    render(<ChatBoxOptimized conversationId={1} />);

    expect(screen.queryByTestId('artifact-panel')).not.toBeInTheDocument();

    const artifactBtn = screen.getByRole('button', {
      name: /Переглянути артефакт: Split View Test/i,
    });
    await user.click(artifactBtn);

    expect(screen.getByTestId('artifact-panel')).toBeInTheDocument();
    expect(screen.getByText('Split View Test')).toBeInTheDocument();
  });

  it('closes ArtifactPanel when close is triggered', async () => {
    const user = userEvent.setup();
    mockMessages = [
      {
        id: 102,
        role: 'assistant',
        content: 'Ось SVG:\n```svg\n<!-- title: Diagram -->\n<svg><circle cx="10" cy="10" r="5"/></svg>\n```',
      },
    ];
    render(<ChatBoxOptimized conversationId={1} />);

    const artifactBtn = screen.getByRole('button', {
      name: /Переглянути артефакт: Diagram/i,
    });
    await user.click(artifactBtn);
    expect(screen.getByTestId('artifact-panel')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'Закрити' });
    await user.click(closeBtn);
    expect(screen.queryByTestId('artifact-panel')).not.toBeInTheDocument();
  });

  it('clears activeArtifact when conversationId changes', async () => {
    const user = userEvent.setup();
    mockMessages = [
      {
        id: 103,
        role: 'assistant',
        content: '```html\n<!-- title: Reset Demo -->\n<div>Demo</div>\n```',
      },
    ];
    const { rerender } = render(<ChatBoxOptimized conversationId={1} />);

    const artifactBtn = screen.getByRole('button', {
      name: /Переглянути артефакт: Reset Demo/i,
    });
    await user.click(artifactBtn);
    expect(screen.getByTestId('artifact-panel')).toBeInTheDocument();

    rerender(<ChatBoxOptimized conversationId={2} />);
    expect(screen.queryByTestId('artifact-panel')).not.toBeInTheDocument();
  });

  it('switches to anthropic provider and enables vision attachment for Claude 3.5 Sonnet', async () => {
    const user = userEvent.setup();
    render(<ChatBoxOptimized conversationId={null} />);

    await user.selectOptions(screen.getByLabelText(/Провайдер AI/i), 'anthropic');
    expect(screen.getByLabelText(/Модель AI/i)).toHaveValue('claude-3-5-sonnet-20241022');
    expect(screen.getByRole('option', { name: 'Claude 3.5 Sonnet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Додати зображення/i })).toBeInTheDocument();
  });

  it('renders SmartAdvisoryBar with active advisory chip and triggers action', async () => {
    const user = userEvent.setup();
    render(<ChatBoxOptimized conversationId={null} />);

    expect(screen.getByText('RAG документи доступні')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вибрати RAG' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Вибрати RAG' }));
  });

  it('renders guide button in controls with warning badge and opens SystemGuideModal', async () => {
    const user = userEvent.setup();
    render(
      <GuideModalProvider>
        <ChatBoxOptimized conversationId={null} />
      </GuideModalProvider>
    );

    const guideBtn = screen.getByRole('button', { name: /🧭 Гід/i });
    expect(guideBtn).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    await user.click(guideBtn);
    expect(screen.getByText(/Гід по системі та AI-асистент/i)).toBeInTheDocument();
  });
});
