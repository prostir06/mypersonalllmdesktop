jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    userSettings: { findUnique: jest.fn() },
    document: { groupBy: jest.fn(), count: jest.fn() },
    userPrompt: { count: jest.fn() },
    userMemoryNote: { count: jest.fn() },
  },
}));

jest.mock('../services/embeddings/resolveEmbeddingContext', () => ({
  resolveEmbeddingContext: jest.fn(),
}));

import prisma from '../config/prisma';
import { resolveEmbeddingContext } from '../services/embeddings/resolveEmbeddingContext';
import {
  buildUserSystemSnapshot,
  evaluateSystemAdvisories,
} from '../services/systemKnowledge/advisor';

const mockedPrisma = prisma as unknown as {
  userSettings: { findUnique: jest.Mock };
  document: { groupBy: jest.Mock; count: jest.Mock };
  userPrompt: { count: jest.Mock };
  userMemoryNote: { count: jest.Mock };
};
const mockedResolveEmbed = resolveEmbeddingContext as jest.Mock;

describe('systemKnowledge advisor', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...origEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(() => {
    process.env = origEnv;
  });

  it('builds snapshot safely without leaking encrypted keys and triggers missing-provider-key + onboarding', async () => {
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o-mini',
      defaultOllamaHost: 'http://127.0.0.1:11434/v1/chat/completions',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: '',
      openaiApiKeyEnc: null,
      geminiApiKeyEnc: 'enc-secret-gemini-never-expose',
      anthropicApiKeyEnc: null,
    });
    mockedPrisma.document.groupBy.mockResolvedValue([]);
    mockedPrisma.document.count.mockResolvedValue(0);
    mockedPrisma.userPrompt.count.mockResolvedValue(0);
    mockedPrisma.userMemoryNote.count.mockResolvedValue(0);
    mockedResolveEmbed.mockResolvedValue({ provider: 'none' });

    const snapshot = await buildUserSystemSnapshot(7);
    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain('enc-secret-gemini-never-expose');
    expect(snapshot.configuredProviders.openai).toBe(false);
    expect(snapshot.configuredProviders.gemini).toBe(true);
    expect(snapshot.configuredProviders.anthropic).toBe(false);
    expect(snapshot.modelSupportsVision).toBe(true);

    const advisories = evaluateSystemAdvisories(snapshot);
    const ids = advisories.map((a) => a.id);
    expect(ids).toContain('missing-provider-key');
    expect(ids).toContain('personalization-onboarding');

    const missingKeyAdv = advisories.find((a) => a.id === 'missing-provider-key');
    expect(missingKeyAdv?.severity).toBe('warning');
    expect(missingKeyAdv?.category).toBe('providers');
    expect(missingKeyAdv?.actionType).toBe('navigate_settings');
    expect(missingKeyAdv?.actionTarget).toBe('/settings?tab=api-keys');

    const onboardingAdv = advisories.find((a) => a.id === 'personalization-onboarding');
    expect(onboardingAdv?.severity).toBe('info');
    expect(onboardingAdv?.actionTarget).toBe('/settings?tab=memory');
  });

  it('detects failed docs, needsReindex docs, rag-fallback-mode, unselected docs, and gemini web search hint', async () => {
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      defaultProvider: 'gemini',
      defaultModel: 'gemini-2.0-flash',
      defaultOllamaHost: null,
      temperature: 0.5,
      maxTokens: 4000,
      systemPrompt: 'Custom role',
      openaiApiKeyEnc: null,
      geminiApiKeyEnc: 'enc-gemini',
      anthropicApiKeyEnc: null,
    });
    mockedPrisma.document.groupBy.mockResolvedValue([
      { status: 'ready', _count: { _all: 1 } },
      { status: 'failed', _count: { _all: 1 } },
    ]);
    mockedPrisma.document.count.mockResolvedValue(1);
    mockedPrisma.userPrompt.count.mockResolvedValue(1);
    mockedPrisma.userMemoryNote.count.mockResolvedValue(2);
    mockedResolveEmbed.mockResolvedValue({ provider: 'none' });

    const snapshot = await buildUserSystemSnapshot(7, {
      selectedDocCount: 0,
      webSearchEnabled: false,
    });
    const advisories = evaluateSystemAdvisories(snapshot);
    const ids = advisories.map((a) => a.id);

    expect(ids).toContain('documents-failed');
    expect(ids).toContain('rag-fallback-mode');
    expect(ids).toContain('rag-docs-unselected');
    expect(ids).toContain('web-search-hint');
    expect(ids).not.toContain('missing-provider-key');
    expect(ids).not.toContain('personalization-onboarding');

    // Warning severity should appear before info severity
    const firstInfoIndex = advisories.findIndex((a) => a.severity === 'info');
    const lastWarningIndex = advisories.map((a) => a.severity).lastIndexOf('warning');
    if (firstInfoIndex !== -1 && lastWarningIndex !== -1) {
      expect(lastWarningIndex).toBeLessThan(firstInfoIndex);
    }
  });

  it('flags documents-needs-reindex when embeddings provider switched', async () => {
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o-mini',
      defaultOllamaHost: null,
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: 'Role',
      openaiApiKeyEnc: 'enc-openai',
      geminiApiKeyEnc: null,
      anthropicApiKeyEnc: null,
    });
    mockedPrisma.document.groupBy.mockResolvedValue([
      { status: 'ready', _count: { _all: 1 } },
    ]);
    mockedPrisma.document.count.mockResolvedValue(1);
    mockedPrisma.userPrompt.count.mockResolvedValue(0);
    mockedPrisma.userMemoryNote.count.mockResolvedValue(1);
    mockedResolveEmbed.mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-123',
    });

    const snapshot = await buildUserSystemSnapshot(7, { selectedDocCount: 1 });
    expect(snapshot.documents.needsReindex).toBe(1);

    const advisories = evaluateSystemAdvisories(snapshot);
    expect(advisories.map((a) => a.id)).toContain('documents-needs-reindex');
  });

  it('respects env keys when user settings have no enc keys', async () => {
    process.env.ANTHROPIC_API_KEY = 'ant-env-key-123';
    mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
    mockedPrisma.document.groupBy.mockResolvedValue([]);
    mockedPrisma.document.count.mockResolvedValue(0);
    mockedPrisma.userPrompt.count.mockResolvedValue(0);
    mockedPrisma.userMemoryNote.count.mockResolvedValue(0);
    mockedResolveEmbed.mockResolvedValue({ provider: 'none' });

    const snapshot = await buildUserSystemSnapshot(42, {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    });

    expect(snapshot.configuredProviders.anthropic).toBe(true);
    expect(snapshot.activeProvider).toBe('anthropic');
    expect(snapshot.activeModel).toBe('claude-3-5-sonnet');
    expect(snapshot.modelSupportsVision).toBe(true);

    const advisories = evaluateSystemAdvisories(snapshot);
    expect(advisories.map((a) => a.id)).not.toContain('missing-provider-key');
  });

  it('rejects instead of returning misleading defaults when a data source fails', async () => {
    mockedPrisma.userSettings.findUnique.mockRejectedValue(new Error('db down'));
    mockedPrisma.document.groupBy.mockResolvedValue([]);
    mockedPrisma.document.count.mockResolvedValue(0);
    mockedPrisma.userPrompt.count.mockResolvedValue(0);
    mockedPrisma.userMemoryNote.count.mockResolvedValue(0);
    mockedResolveEmbed.mockResolvedValue({ provider: 'none' });

    await expect(buildUserSystemSnapshot(7)).rejects.toThrow('db down');
  });

  it('does not require an API key for the ollama provider', async () => {
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      defaultProvider: 'ollama',
      defaultModel: 'llama3',
      defaultOllamaHost: null,
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: 'Role',
      openaiApiKeyEnc: null,
      geminiApiKeyEnc: null,
      anthropicApiKeyEnc: null,
    });
    mockedPrisma.document.groupBy.mockResolvedValue([]);
    mockedPrisma.document.count.mockResolvedValue(0);
    mockedPrisma.userPrompt.count.mockResolvedValue(0);
    mockedPrisma.userMemoryNote.count.mockResolvedValue(0);
    mockedResolveEmbed.mockResolvedValue({ provider: 'none' });

    const snapshot = await buildUserSystemSnapshot(7);
    const ids = evaluateSystemAdvisories(snapshot).map((a) => a.id);

    expect(ids).not.toContain('missing-provider-key');
  });

});
