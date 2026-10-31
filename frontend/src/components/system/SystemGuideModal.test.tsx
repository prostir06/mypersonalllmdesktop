import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemGuideModal from './SystemGuideModal';
import type { SystemKnowledgeResponse, AdvisoryTip, KnowledgeCard } from '../../types/api';

const mockKnowledge: SystemKnowledgeResponse = {
  versionHash: 'test-hash-1234',
  generatedAt: '2026-10-31T12:00:00Z',
  snapshot: {
    activeProvider: 'openai',
    activeModel: 'gpt-4o',
    modelSupportsVision: true,
    modelSupportsWebSearch: false,
    webSearchEnabled: false,
    configuredProviders: {
      openai: true,
      gemini: false,
      anthropic: false,
      ollamaHost: 'http://localhost:11434',
    },
    ragEmbeddingMode: 'openai',
    documents: {
      total: 5,
      ready: 4,
      pending: 1,
      failed: 0,
      needsReindex: 0,
      selectedInChat: 2,
    },
    hasCustomSystemPrompt: false,
    pinnedPromptsCount: 3,
    userMemoryNotesCount: 7,
    temperature: 0.7,
    maxTokens: 4096,
  },
  advisories: [
    {
      id: 'rag_docs_ready_none_selected',
      severity: 'warning',
      category: 'rag',
      title: 'Документи RAG доступні, але не вибрані для чату',
      message: 'У базі є 4 готових документи, але жоден не додано до контексту.',
      actionLabel: 'Відкрити документи',
      actionType: 'open_documents',
      suggestedPrompt: 'Які документи зараз доступні в моїй базі?',
    },
    {
      id: 'gemini_search_available',
      severity: 'info',
      category: 'chat_tools',
      title: 'Доступний пошук Google',
      message: 'Увімкніть веб-пошук для актуальних даних.',
      actionLabel: 'Налаштувати',
      actionType: 'navigate_settings',
    },
  ],
  cards: [
    {
      id: 'rag_overview',
      category: 'rag',
      title: 'RAG База Знань',
      summary: 'Семантичний пошук у завантажених документах.',
      whyUse: 'Для точних відповідей по власних файлах.',
      howToUse: 'Завантажте PDF/TXT і виберіть його чекбоксом.',
      uiPath: 'Чат -> Документи',
      keywords: ['rag', 'документи', 'вектори'],
      liveFacts: {
        'Готових документів': 4,
        'Режим ембедингів': 'openai',
      },
    },
    {
      id: 'artifacts_panel',
      category: 'artifacts',
      title: 'Артефакти та Візуалізація',
      summary: 'Інтерактивний перегляд згенерованого коду та HTML.',
      whyUse: 'Для роботи з великими блоками коду.',
      howToUse: 'AI автоматично генерує артефакт або вкажіть це в запиті.',
      uiPath: 'Права панель чату',
      keywords: ['артефакти', 'код', 'html'],
      liveFacts: {
        'Підтримка HTML': true,
      },
    },
  ],
};

describe('SystemGuideModal', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('renders modal header, version hash in footer, and loading spinner when isLoading=true', () => {
    render(<SystemGuideModal show onHide={vi.fn()} isLoading />);

    expect(screen.getByText(/Гід по системі та AI-асистент/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders status summary and advisories list in Tab 1, and triggers actions', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onAskPrompt = vi.fn();
    const onHide = vi.fn();

    render(
      <SystemGuideModal
        show
        onHide={onHide}
        knowledge={mockKnowledge}
        onAction={onAction}
        onAskPrompt={onAskPrompt}
      />
    );

    // Snapshot pills check
    expect(screen.getByText(/openai \(gpt-4o\)/i)).toBeInTheDocument();
    expect(screen.getByText(/4 готових, 2 обрано/i)).toBeInTheDocument();
    expect(screen.getByText(/7 глобальних фактів, 3 закріплених ролей/i)).toBeInTheDocument();

    // Advisories check
    expect(screen.getByText('Документи RAG доступні, але не вибрані для чату')).toBeInTheDocument();
    expect(screen.getByText('Доступний пошук Google')).toBeInTheDocument();

    // Trigger action on first advisory
    const actionBtn = screen.getByRole('button', { name: 'Відкрити документи' });
    await user.click(actionBtn);

    expect(onAction).toHaveBeenCalledWith(mockKnowledge.advisories[0]);
    expect(onHide).toHaveBeenCalled();

    // Trigger suggested prompt
    const askAiBtn = screen.getByRole('button', { name: 'Запитати AI' });
    await user.click(askAiBtn);

    expect(onAskPrompt).toHaveBeenCalledWith('Які документи зараз доступні в моїй базі?');
  });

  it('renders friendly empty state card when advisories list is empty', () => {
    render(
      <SystemGuideModal
        show
        onHide={vi.fn()}
        knowledge={{
          ...mockKnowledge,
          advisories: [],
        }}
      />
    );

    expect(
      screen.getByText('Усе оптимально налаштовано! Жодних проблем не виявлено.')
    ).toBeInTheDocument();
  });

  it('switches to catalog tab, filters by category and search keyword, and asks AI about card', async () => {
    const user = userEvent.setup();
    const onAskPrompt = vi.fn();
    const onHide = vi.fn();

    render(
      <SystemGuideModal
        show
        onHide={onHide}
        knowledge={mockKnowledge}
        onAskPrompt={onAskPrompt}
      />
    );

    // Switch to catalog tab
    const catalogTab = screen.getByRole('tab', { name: /Функції та Налаштування/i });
    await user.click(catalogTab);

    // Check footer version hash
    expect(screen.getByText(/Версія бази знань: #test-hash-1234/i)).toBeInTheDocument();

    // Both cards should initially be shown
    expect(screen.getByText('RAG База Знань')).toBeInTheDocument();
    expect(screen.getByText('Артефакти та Візуалізація')).toBeInTheDocument();

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Пошук функцій за назвою/i);
    await user.type(searchInput, 'семантичний');

    expect(screen.getByText('RAG База Знань')).toBeInTheDocument();
    expect(screen.queryByText('Артефакти та Візуалізація')).not.toBeInTheDocument();

    // Clear search
    await user.clear(searchInput);
    expect(screen.getByText('Артефакти та Візуалізація')).toBeInTheDocument();

    // Filter by Category button
    const artifactsCategoryBtn = screen.getByRole('button', { name: 'Артефакти' });
    await user.click(artifactsCategoryBtn);

    expect(screen.queryByText('RAG База Знань')).not.toBeInTheDocument();
    expect(screen.getByText('Артефакти та Візуалізація')).toBeInTheDocument();

    // Ask AI about this feature
    const askAboutCardBtn = screen.getByRole('button', {
      name: /Запитати AI про цю функцію/i,
    });
    await user.click(askAboutCardBtn);

    expect(onAskPrompt).toHaveBeenCalledWith(
      'Розкажи детальніше про функцію "Артефакти та Візуалізація" та як її найефективніше використовувати.'
    );
    expect(onHide).toHaveBeenCalled();
  });
});
