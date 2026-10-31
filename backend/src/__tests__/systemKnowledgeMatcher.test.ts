process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://mock:mock@localhost:5432/mock_db';

import {
  formatTier1Passport,
  formatTier2Cards,
  matchRelevantKnowledgeCards,
} from '../services/systemKnowledge/matcher';
import { getCuratedKnowledgeCards } from '../services/systemKnowledge/registry';
import type {
  AdvisoryTip,
  KnowledgeCard,
  UserSystemSnapshot,
} from '../services/systemKnowledge/types';

describe('System Knowledge Matcher & Formatters', () => {
  const dummySnapshot: UserSystemSnapshot = {
    activeProvider: 'openai',
    activeModel: 'gpt-4o',
    modelSupportsVision: true,
    modelSupportsWebSearch: false,
    webSearchEnabled: false,
    configuredProviders: {
      openai: true,
      gemini: false,
      anthropic: false,
      ollamaHost: 'http://127.0.0.1:11434/v1/chat/completions',
    },
    ragEmbeddingMode: 'openai',
    documents: {
      total: 3,
      ready: 2,
      pending: 0,
      failed: 1,
      needsReindex: 0,
      selectedInChat: 1,
    },
    hasCustomSystemPrompt: false,
    pinnedPromptsCount: 1,
    userMemoryNotesCount: 4,
    temperature: 0.7,
    maxTokens: 2000,
  };

  const sampleAdvisories: AdvisoryTip[] = [
    {
      id: 'documents-failed',
      severity: 'warning',
      category: 'rag',
      title: 'Помилка індексації документів',
      message: '1 документ завершився помилкою',
      actionLabel: 'Переглянути документи',
      actionType: 'open_documents',
      actionTarget: '/documents',
    },
    {
      id: 'missing-gemini-key',
      severity: 'info',
      category: 'providers',
      title: 'Підказка',
      message: 'Інформаційне повідомлення',
      actionLabel: 'ОК',
      actionType: 'navigate_settings',
    },
  ];

  const cards = getCuratedKnowledgeCards();

  describe('formatTier1Passport', () => {
    it('formats a compact passport block with platform identity and capabilities', () => {
      const passport = formatTier1Passport(dummySnapshot, sampleAdvisories, 'abc123hash');

      expect(passport).toContain('LLM Personal Assistant Control Panel');
      expect(passport).toContain('мультипровайдерний чат');
      expect(passport).toContain('Hybrid RAG');
      expect(passport).toContain('ArtifactPanel');
      expect(passport).toContain('abc123hash');
      expect(passport).toContain('Провайдер=openai');
      expect(passport).toContain('Модель=gpt-4o');
      expect(passport).toContain('Vision=так');
      expect(passport).toContain('documents-failed');
      // info advisories should not appear in warnings
      expect(passport).not.toContain('missing-gemini-key');
    });

    it('shows "немає" when there are no active warning advisories', () => {
      const passport = formatTier1Passport(
        dummySnapshot,
        [sampleAdvisories[1]], // only info advisory
        'versionxyz'
      );
      expect(passport).toContain('Активні попередження=немає');
    });
  });

  describe('formatTier2Cards', () => {
    it('returns empty string when no cards provided', () => {
      expect(formatTier2Cards([])).toBe('');
    });

    it('formats header and card fields when cards are provided', () => {
      const sampleCard: KnowledgeCard = cards.find((c) => c.id === 'rag-hybrid')!;
      const result = formatTier2Cards([sampleCard]);

      expect(result).toContain('ℹ️ ДЕТАЛЬНА ДОВІДКА ПО ФУНКЦІЯХ ПЛАТФОРМИ');
      expect(result).toContain(`📌 ${sampleCard.title} (${sampleCard.uiPath})`);
      expect(result).toContain(`Призначення: ${sampleCard.summary}`);
      expect(result).toContain(`Для чого: ${sampleCard.whyUse}`);
      expect(result).toContain(`Як використовувати: ${sampleCard.howToUse}`);
      expect(result).toContain(`Поточні параметри: ${JSON.stringify(sampleCard.liveFacts)}`);
    });
  });

  describe('matchRelevantKnowledgeCards', () => {
    it('returns empty array for unrelated prompts without active category warnings', () => {
      const matched = matchRelevantKnowledgeCards(
        'Напиши функцію сортування масиву на Python',
        dummySnapshot,
        [], // no advisories
        cards
      );
      expect(matched).toEqual([]);
    });

    it('matches provider and settings cards when user asks about provider or settings', () => {
      const matched = matchRelevantKnowledgeCards(
        'Як налаштувати провайдер OpenAI та API ключ?',
        dummySnapshot,
        [],
        cards
      );
      expect(matched.length).toBeGreaterThan(0);
      expect(matched.length).toBeLessThanOrEqual(4);
      const ids = matched.map((c) => c.id);
      expect(ids).toContain('provider-openai');
    });

    it('matches RAG card when user asks about documents or vector search', () => {
      const matched = matchRelevantKnowledgeCards(
        'Як працює пошук по документах та ембедінги в RAG?',
        dummySnapshot,
        [],
        cards
      );
      const ids = matched.map((c) => c.id);
      expect(ids).toContain('rag-hybrid');
    });

    it('matches memory card when user asks about memory or notes', () => {
      const matched = matchRelevantKnowledgeCards(
        'Де зберігаються нотатки пам’яті користувача?',
        dummySnapshot,
        [],
        cards
      );
      const ids = matched.map((c) => c.id);
      expect(ids).toContain('memory-dual');
    });

    it('matches artifacts card when user asks about visual artifacts and mermaid', () => {
      const matched = matchRelevantKnowledgeCards(
        'Згенеруй інтерактивний html або діаграму mermaid в артефактах',
        dummySnapshot,
        [],
        cards
      );
      const ids = matched.map((c) => c.id);
      expect(ids).toContain('interactive-artifacts');
    });

    it('boosts card with active warning when ragEnabled is true even for generic query', () => {
      const matched = matchRelevantKnowledgeCards(
        'Розкажи щось цікаве',
        dummySnapshot,
        sampleAdvisories, // has 'documents-failed' warning in category 'rag'
        cards,
        { ragEnabled: true }
      );
      const ids = matched.map((c) => c.id);
      expect(ids).toContain('rag-hybrid');
    });

    it('caps returned cards at 4 max', () => {
      const matched = matchRelevantKnowledgeCards(
        'Покажи всі налаштування провайдер токени модель документи памʼять артефакти експорт десктоп',
        dummySnapshot,
        [],
        cards
      );
      expect(matched.length).toBeLessThanOrEqual(4);
    });
  });
});
