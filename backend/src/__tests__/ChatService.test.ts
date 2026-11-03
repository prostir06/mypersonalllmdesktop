jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    conversation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    userSettings: {
      findUnique: jest.fn(),
    },
    userPrompt: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../services/EmbeddingService', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(),
    generateEmbedding: jest.fn(),
    findRelevantChunks: jest.fn(),
  },
}));

jest.mock('../services/providerFactory', () => ({
  __esModule: true,
  default: {
    sendMessage: jest.fn(),
    streamMessage: jest.fn(),
  },
}));

jest.mock('../services/embeddings/resolveEmbeddingContext', () => ({
  resolveEmbeddingContext: jest.fn(),
}));

jest.mock('../services/conversationMemoryService', () => ({
  buildMemorySystemMessages: jest.fn(),
  maybeRefreshSummary: jest.fn(),
}));

jest.mock('../services/userMemoryService', () => ({
  buildUserMemorySystemMessages: jest.fn().mockResolvedValue([]),
}));

jest.mock('../services/systemKnowledge', () => ({
  buildSystemKnowledgeMessages: jest.fn().mockResolvedValue([]),
}));

jest.mock('../services/webSearch', () => ({
  __esModule: true,
  default: {
    searchWeb: jest.fn().mockResolvedValue({ items: [], backend: 'none' }),
    formatUntrustedWebResultsBlock: jest.fn().mockReturnValue(''),
    toWebRagSources: jest.fn().mockReturnValue([]),
    resolveWebSearchBackend: jest.fn().mockReturnValue('none'),
  },
  WebSearchService: {
    searchWeb: jest.fn().mockResolvedValue({ items: [], backend: 'none' }),
    formatUntrustedWebResultsBlock: jest.fn().mockReturnValue(''),
    toWebRagSources: jest.fn().mockReturnValue([]),
    resolveWebSearchBackend: jest.fn().mockReturnValue('none'),
  },
  searchWeb: jest.fn().mockResolvedValue({ items: [], backend: 'none' }),
  formatUntrustedWebResultsBlock: jest.fn().mockReturnValue(''),
  toWebRagSources: jest.fn().mockReturnValue([]),
  resolveWebSearchBackend: jest.fn().mockReturnValue('none'),
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import prisma from '../config/prisma';
import EmbeddingService from '../services/EmbeddingService';
import ProviderFactory from '../services/providerFactory';
import ChatService from '../services/ChatService';
import { buildSystemContext } from '../services/chat/systemContext';
import { buildSystemKnowledgeMessages } from '../services/systemKnowledge';
import { resolveEmbeddingContext } from '../services/embeddings/resolveEmbeddingContext';
import {
  buildMemorySystemMessages,
  maybeRefreshSummary,
} from '../services/conversationMemoryService';
import WebSearchService from '../services/webSearch';

const mockedPrisma = prisma as any;
const mockedEmbed = EmbeddingService as any;
const mockedProvider = ProviderFactory as any;
const mockedResolveCtx = resolveEmbeddingContext as jest.Mock;
const mockedBuildMemory = buildMemorySystemMessages as jest.Mock;
const mockedMaybeRefreshSummary = maybeRefreshSummary as jest.Mock;
const mockedBuildSystemKnowledge = buildSystemKnowledgeMessages as jest.Mock;
const mockedWebSearch = WebSearchService as any;

describe('ChatService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedBuildMemory.mockResolvedValue([]);
    mockedBuildSystemKnowledge.mockResolvedValue([]);
    mockedWebSearch.searchWeb.mockResolvedValue({ items: [], backend: 'none' });
    mockedWebSearch.formatUntrustedWebResultsBlock.mockReturnValue('');
    mockedWebSearch.toWebRagSources.mockReturnValue([]);
    mockedMaybeRefreshSummary.mockResolvedValue(undefined);
    mockedResolveCtx.mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-test',
    });
    mockedPrisma.userPrompt.findMany.mockResolvedValue([]);
    mockedPrisma.conversation.findUnique.mockResolvedValue({
      title: 'Existing',
    });
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        message: mockedPrisma.message,
        conversation: mockedPrisma.conversation,
      };
      return fn(tx);
    });
  });

  describe('ensureConversationId', () => {
    it('creates conversation when conversationId is undefined', async () => {
      mockedPrisma.conversation.create.mockResolvedValue({ id: 11 });
      const id = await ChatService.ensureConversationId(1, undefined, 'Hello');
      expect(id).toBe(11);
      expect(mockedPrisma.conversation.create).toHaveBeenCalled();
    });

    it('does not treat 0 as missing — returns 404 path via ChatError', async () => {
      await expect(
        ChatService.ensureConversationId(1, 0, 'Hello')
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(mockedPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('accepts numeric string conversationId from JSON/URL clients', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 41 });
      const id = await ChatService.ensureConversationId(
        1,
        '41' as unknown as number,
        'Вітаю'
      );
      expect(id).toBe(41);
      expect(mockedPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: 41, userId: 1 },
        select: { id: true },
      });
    });
  });

  describe('loadRecentMessages', () => {
    it('loads linear branch-aware history capped at 50 turns', async () => {
      const rows = Array.from({ length: 55 }, (_, i) => ({
        id: i + 1,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `m${i}`,
        parentId: i % 2 === 1 ? i : null,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      }));
      mockedPrisma.message.findMany.mockResolvedValue([...rows].reverse());

      const msgs = await ChatService.loadRecentMessages(1);

      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 1 },
        orderBy: { createdAt: 'desc' },
        take: expect.any(Number),
        select: expect.objectContaining({
          id: true,
          role: true,
          content: true,
          parentId: true,
        }),
      });
      expect(msgs.length).toBeLessThanOrEqual(50);
      expect(msgs.at(-1)?.content).toBe('m54');
    });

    it('loadRecentMessages caps raw rows via take', async () => {
      mockedPrisma.message.findMany.mockResolvedValue([]);
      await ChatService.loadRecentMessages(1);
      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: expect.any(Number),
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  describe('buildSystemContext', () => {
    it('returns sources array with messages', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);

      const result = await buildSystemContext(1, {}, 'hi');

      expect(Array.isArray(result.messages)).toBe(true);
      expect(Array.isArray(result.sources)).toBe(true);
      expect(result).toEqual({ messages: [], sources: [], ragStatus: 'skipped' });
    });

    it('includes system prompt and pinned prompts together', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue({
        systemPrompt: 'SYS',
      });
      mockedPrisma.userPrompt.findMany.mockResolvedValue([{ prompt: 'PIN' }]);
      mockedEmbed.isAvailable.mockReturnValue(false);

      const result = await buildSystemContext(1, {}, 'hi');
      const contents = result.messages.map((m) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      );
      const sysIdx = contents.findIndex((c: string) => c.includes('SYS'));
      const pinIdx = contents.findIndex((c: string) => c.includes('PIN'));
      expect(sysIdx).toBeGreaterThanOrEqual(0);
      expect(pinIdx).toBeGreaterThanOrEqual(0);
      expect(sysIdx).toBeLessThan(pinIdx);
    });

    it('collects RAG chunk sources', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(true);
      mockedEmbed.generateEmbedding.mockResolvedValue([0.1]);
      mockedEmbed.findRelevantChunks.mockResolvedValue([
        { content: 'chunk', filename: 'a.txt', similarity: 0.9 },
        { content: 'chunk 2', filename: 'b.txt' },
      ]);

      const result = await buildSystemContext(1, { ragEnabled: true }, 'query');

      expect(result.ragStatus).toBe('ok');
      expect(result.sources).toEqual([
        { filename: 'a.txt', similarity: 0.9 },
        { filename: 'b.txt', similarity: undefined },
      ]);
      expect(result.messages[0].content).toContain('a.txt');
    });

    it('attaches sheet name from ## Sheet: header to sources', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedEmbed.findRelevantChunks.mockResolvedValue([
        {
          content: '## Sheet: Sales\nA,1',
          filename: 'book.xlsx',
          similarity: 0.7,
        },
      ]);

      const result = await buildSystemContext(1, { ragEnabled: true }, 'q');

      expect(result.sources).toEqual([
        { filename: 'book.xlsx', similarity: 0.7, sheet: 'Sales' },
      ]);
      expect(result.messages[0].content).toContain('book.xlsx');
      expect(result.messages[0].content).toContain('Sales');
    });

    it('calls EmbeddingService without pool', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue({
        systemPrompt: 'Be helpful',
      });
      mockedEmbed.isAvailable.mockReturnValue(true);
      mockedEmbed.generateEmbedding.mockResolvedValue([0.1]);
      mockedEmbed.findRelevantChunks.mockResolvedValue([
        { content: 'chunk', filename: 'a.txt', similarity: 0.9 },
      ]);

      const msgs = await ChatService.buildSystemContext(
        1,
        { ragEnabled: true, requestId: 'rid-chat' },
        'query'
      );

      expect(mockedEmbed.findRelevantChunks).toHaveBeenCalledWith(
        [0.1],
        1,
        [],
        5,
        { requestId: 'rid-chat' },
        'openai',
        'query'
      );
      expect(mockedEmbed.findRelevantChunks.mock.calls[0].length).toBe(7);
      expect(msgs[0].content).toBe('Be helpful');
      expect(msgs[1].content).toContain('КОНТЕКСТ З ЗАВАНТАЖЕНИХ ДОКУМЕНТІВ');
    });

    it('continues when settings load fails', async () => {
      mockedPrisma.userSettings.findUnique.mockRejectedValue(new Error('db down'));
      mockedEmbed.isAvailable.mockReturnValue(false);

      const msgs = await ChatService.buildSystemContext(1, {}, 'hi');
      expect(msgs).toEqual([]);
    });

    it('continues when RAG fails', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue({
        systemPrompt: 'Keep going',
      });
      mockedEmbed.isAvailable.mockReturnValue(true);
      mockedEmbed.generateEmbedding.mockRejectedValue(new Error('embed fail'));

      const result = await ChatService.buildSystemContextWithSources(
        1,
        { ragEnabled: true },
        'q'
      );
      expect(result.ragStatus).toBe('error');
      expect(result.messages).toEqual([{ role: 'system', content: 'Keep going' }]);
      expect(result.sources).toEqual([]);
    });

    it('sets ragStatus empty when retrieve returns no chunks', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedEmbed.findRelevantChunks.mockResolvedValue([]);

      const result = await ChatService.buildSystemContextWithSources(
        1,
        { ragEnabled: true },
        'q'
      );
      expect(result.ragStatus).toBe('empty');
      expect(result.sources).toEqual([]);
    });

    it('includes pinned user prompts in system context', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedPrisma.userPrompt.findMany.mockResolvedValue([
        { prompt: 'Always be concise' },
      ]);
      mockedEmbed.isAvailable.mockReturnValue(false);

      const msgs = await ChatService.buildSystemContext(1, {}, 'hi');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toContain('ЗАКРІПЛЕНІ ІНСТРУКЦІЇ');
      expect(msgs[0].content).toContain('Always be concise');
    });

    it('includes ephemeral attachments in system context', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);

      const msgs = await ChatService.buildSystemContext(
        1,
        { attachments: [{ filename: 'notes.txt', content: 'hello file' }] },
        'hi'
      );
      expect(msgs[0].content).toContain('notes.txt');
      expect(msgs[0].content).toContain('hello file');
    });

    it('sanitizes documentIds before RAG', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedEmbed.findRelevantChunks.mockResolvedValue([]);

      await ChatService.buildSystemContext(
        1,
        { documentIds: [1, -2, 3.5, '4', 'x'] as unknown as number[] },
        'q'
      );

      expect(mockedEmbed.findRelevantChunks).toHaveBeenCalledWith(
        null,
        1,
        [1, 4],
        5,
        {},
        null,
        'q'
      );
    });

    it('prepends system knowledge messages to system prompt', async () => {
      mockedBuildSystemKnowledge.mockResolvedValueOnce([
        { role: 'system', content: 'SYSTEM KNOWLEDGE TIER 1' },
      ]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue({
        systemPrompt: 'CUSTOM PROMPT',
      });

      const result = await buildSystemContext(1, {}, 'test message');

      expect(result.messages.length).toBe(2);
      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'SYSTEM KNOWLEDGE TIER 1',
      });
      expect(result.messages[1]).toEqual({
        role: 'system',
        content: 'CUSTOM PROMPT',
      });
    });

    it('degrades gracefully when buildSystemKnowledgeMessages throws', async () => {
      mockedBuildSystemKnowledge.mockRejectedValueOnce(
        new Error('Knowledge failure')
      );
      mockedPrisma.userSettings.findUnique.mockResolvedValue({
        systemPrompt: 'CUSTOM PROMPT',
      });

      const result = await buildSystemContext(1, {}, 'test message');

      expect(result.messages.length).toBe(1);
      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'CUSTOM PROMPT',
      });
    });

    it('performs pre-search when enableWebSearch is true for non-gemini without tools', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedWebSearch.searchWeb.mockResolvedValueOnce({
        items: [
          { title: 'Kyiv News', url: 'https://news.kyiv.ua', snippet: 'Latest updates from Kyiv' },
        ],
        backend: 'searxng',
      });
      mockedWebSearch.formatUntrustedWebResultsBlock.mockReturnValueOnce(
        '<untrusted_web_result index="1" url="https://news.kyiv.ua" title="Kyiv News">\nLatest updates from Kyiv\n</untrusted_web_result>'
      );
      mockedWebSearch.toWebRagSources.mockReturnValueOnce([
        {
          id: 'web-0',
          filename: 'Kyiv News',
          url: 'https://news.kyiv.ua',
          snippet: 'Latest updates from Kyiv',
          score: 1.0,
          source_type: 'web_search',
          type: 'web',
        },
      ]);

      const result = await buildSystemContext(
        1,
        { enableWebSearch: true, activeProvider: 'ollama', activeModel: 'llama3:8b' },
        'what is happening in Kyiv'
      );

      expect(mockedWebSearch.searchWeb).toHaveBeenCalledWith('what is happening in Kyiv', {
        maxResults: 5,
      });
      expect(
        result.messages.some(
          (m) => typeof m.content === 'string' && m.content.includes('<untrusted_web_result')
        )
      ).toBe(true);
      expect(result.sources).toEqual([
        expect.objectContaining({
          filename: 'Kyiv News',
          url: 'https://news.kyiv.ua',
          type: 'web',
        }),
      ]);
    });

    it('skips pre-search when provider is gemini even if enableWebSearch is true', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);

      await buildSystemContext(
        1,
        { enableWebSearch: true, activeProvider: 'gemini', activeModel: 'gemini-2.0-flash' },
        'what is happening'
      );

      expect(mockedWebSearch.searchWeb).not.toHaveBeenCalled();
    });

    it('skips pre-search when tools are enabled on tool-capable model', async () => {
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);

      await buildSystemContext(
        1,
        { enableWebSearch: true, toolsEnabled: true, activeProvider: 'openai', activeModel: 'gpt-4o' },
        'search something'
      );

      expect(mockedWebSearch.searchWeb).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('creates conversation + two messages when conversationId missing', async () => {
      mockedPrisma.conversation.create.mockResolvedValue({ id: 42 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedProvider.sendMessage.mockResolvedValue({
        content: 'Hi',
        usage: { total_tokens: 10 },
      });
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({
          id: 101,
          createdAt: new Date('2026-08-01T10:00:00Z'),
        });
      mockedPrisma.conversation.update.mockResolvedValue({});

      const result = await ChatService.sendMessage({
        userId: 1,
        message: 'Hello world',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        options: {},
      });

      expect(mockedPrisma.conversation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 1 }),
      });
      expect(mockedPrisma.$transaction).toHaveBeenCalled();
      expect(result).toMatchObject({
        conversationId: 42,
        messageId: 101,
        content: 'Hi',
        role: 'assistant',
      });
      expect(mockedProvider.sendMessage).toHaveBeenCalled();
    });

    it('persists tokenUsage and returns it in response when provider returns tokenUsage', async () => {
      mockedPrisma.conversation.create.mockResolvedValue({ id: 42 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      const fakeTokenUsage = {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        estimatedCostUsd: 0.00002,
      };
      mockedProvider.sendMessage.mockResolvedValue({
        content: 'Hi with tokens',
        usage: { total_tokens: 15 },
        tokenUsage: fakeTokenUsage,
      });
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({
          id: 101,
          createdAt: new Date('2026-08-01T10:00:00Z'),
        });
      mockedPrisma.conversation.update.mockResolvedValue({});

      const result = await ChatService.sendMessage({
        userId: 1,
        message: 'Hello tokens',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        options: {},
      });

      expect(mockedPrisma.message.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'assistant',
            tokenUsage: fakeTokenUsage,
          }),
        })
      );
      expect(result.tokenUsage).toEqual(fakeTokenUsage);
    });

    it('forces enableTools false before provider call', async () => {
      mockedPrisma.conversation.create.mockResolvedValue({ id: 42 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedProvider.sendMessage.mockResolvedValue({
        content: 'Hi',
        usage: {},
      });
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({
          id: 101,
          createdAt: new Date('2026-08-01T10:00:00Z'),
        });
      mockedPrisma.conversation.update.mockResolvedValue({});

      await ChatService.sendMessage({
        userId: 1,
        message: 'Hello',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        options: { enableTools: true },
      });

      const opts = mockedProvider.sendMessage.mock.calls[0][3];
      expect(opts.enableTools).toBe(false);
    });

    it('throws ChatError 403 for foreign conversation', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        ChatService.sendMessage({
          userId: 1,
          conversationId: 99,
          message: 'x',
          options: {},
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('propagates provider failures', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedProvider.sendMessage.mockRejectedValue(new Error('provider down'));

      await expect(
        ChatService.sendMessage({
          userId: 1,
          conversationId: 10,
          message: 'hi',
          options: {},
        })
      ).rejects.toThrow('provider down');
    });

    it('includes sources when RAG returns chunks', async () => {
      mockedPrisma.conversation.create.mockResolvedValue({ id: 42 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(true);
      mockedEmbed.generateEmbedding.mockResolvedValue([0.1]);
      mockedEmbed.findRelevantChunks.mockResolvedValue([
        { content: 'chunk', filename: 'a.txt', similarity: 0.91 },
      ]);
      mockedProvider.sendMessage.mockResolvedValue({
        content: 'Hi',
        usage: { total_tokens: 10 },
      });
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({
          id: 101,
          createdAt: new Date('2026-08-01T10:00:00Z'),
        });
      mockedPrisma.conversation.update.mockResolvedValue({});

      const result = await ChatService.sendMessage({
        userId: 1,
        message: 'Hello world',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        options: { ragEnabled: true },
      });

      expect(result.sources?.[0]).toEqual({
        filename: 'a.txt',
        similarity: 0.91,
      });
    });

    it('merges provider grounding sources with RAG sources in sendMessage', async () => {
      mockedPrisma.conversation.create.mockResolvedValue({ id: 42 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(true);
      mockedEmbed.generateEmbedding.mockResolvedValue([0.1]);
      mockedEmbed.findRelevantChunks.mockResolvedValue([
        { content: 'chunk', filename: 'rag.pdf', similarity: 0.95 },
      ]);
      mockedProvider.sendMessage.mockResolvedValue({
        content: 'Grounding reply',
        usage: { total_tokens: 20 },
        sources: [
          {
            id: 'web-0',
            filename: 'Google News',
            snippet: 'Google News',
            url: 'https://news.google.com',
            score: 1.0,
            source_type: 'web_search',
          },
        ],
      });
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({
          id: 101,
          createdAt: new Date('2026-08-01T10:00:00Z'),
        });
      mockedPrisma.conversation.update.mockResolvedValue({});

      const result = await ChatService.sendMessage({
        userId: 1,
        message: 'What is happening',
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        options: { ragEnabled: true, enableWebSearch: true },
      });

      expect(result.sources).toEqual([
        { filename: 'rag.pdf', similarity: 0.95 },
        {
          id: 'web-0',
          filename: 'Google News',
          snippet: 'Google News',
          url: 'https://news.google.com',
          score: 1.0,
          source_type: 'web_search',
        },
      ]);
    });

    it('executes pre-search and merges web rag sources for non-tool model with enableWebSearch: true', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedProvider.sendMessage.mockResolvedValue({
        content: 'Search results synthesized',
        usage: { total_tokens: 25 },
      });
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({
          id: 101,
          createdAt: new Date('2026-08-01T10:00:00Z'),
        });
      mockedPrisma.conversation.update.mockResolvedValue({});

      mockedWebSearch.searchWeb.mockResolvedValueOnce({
        items: [
          { title: 'Tavily Tech News', url: 'https://tavily.com/news', snippet: 'AI breakthrough' },
        ],
        backend: 'tavily',
      });
      mockedWebSearch.formatUntrustedWebResultsBlock.mockReturnValueOnce(
        '<untrusted_web_result index="1" url="https://tavily.com/news" title="Tavily Tech News">\nAI breakthrough\n</untrusted_web_result>'
      );
      mockedWebSearch.toWebRagSources.mockReturnValueOnce([
        {
          id: 'web-0',
          filename: 'Tavily Tech News',
          url: 'https://tavily.com/news',
          snippet: 'AI breakthrough',
          score: 1.0,
          source_type: 'web_search',
          type: 'web',
        },
      ]);

      const result = await ChatService.sendMessage({
        userId: 1,
        message: 'latest AI breakthrough',
        provider: 'ollama',
        model: 'llama3:8b',
        options: { enableWebSearch: true },
      });

      expect(mockedWebSearch.searchWeb).toHaveBeenCalledWith('latest AI breakthrough', {
        maxResults: 5,
      });
      expect(result.sources).toEqual([
        expect.objectContaining({
          filename: 'Tavily Tech News',
          url: 'https://tavily.com/news',
          type: 'web',
        }),
      ]);
      expect(mockedPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sources: expect.arrayContaining([
              expect.objectContaining({
                filename: 'Tavily Tech News',
                url: 'https://tavily.com/news',
              }),
            ]),
          }),
        })
      );
    });

    it('returns success result when maybeRefreshSummary throws', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedProvider.sendMessage.mockResolvedValue({
        content: 'Hi',
        usage: { total_tokens: 10 },
      });
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({
          id: 101,
          createdAt: new Date('2026-08-01T10:00:00Z'),
        });
      mockedPrisma.conversation.update.mockResolvedValue({});
      mockedMaybeRefreshSummary.mockRejectedValueOnce(new Error('summary down'));

      const result = await ChatService.sendMessage({
        userId: 1,
        conversationId: 10,
        message: 'Hello world',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        options: {},
      });

      expect(result).toMatchObject({
        conversationId: 10,
        messageId: 101,
        content: 'Hi',
        role: 'assistant',
      });
      expect(mockedMaybeRefreshSummary).toHaveBeenCalledWith(1, 10);
    });
  });

  describe('getHistory', () => {
    it('throws 404 when conversation not owned', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue(null);
      await expect(ChatService.getHistory(1, 5, 100, 0)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws 404 for invalid conversationId', async () => {
      await expect(ChatService.getHistory(1, NaN, 100, 0)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(mockedPrisma.conversation.findFirst).not.toHaveBeenCalled();
    });

    it('returns snake_case created_at with linear history', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 5 });
      const createdAt = new Date('2026-08-01T12:00:00Z');
      mockedPrisma.message.findMany.mockResolvedValue([
        {
          id: 1,
          role: 'user',
          content: 'a',
          parentId: null,
          createdAt,
        },
      ]);

      const result = await ChatService.getHistory(1, 5, 100, 0);
      expect(result.messages[0]).toEqual({
        id: 1,
        role: 'user',
        content: 'a',
        created_at: createdAt,
      });
      expect(result.total).toBe(1);
    });

    it('returns total as linear message count not raw row count', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 5 });
      const t = new Date('2026-08-01T12:00:00Z');
      mockedPrisma.message.findMany.mockResolvedValue([
        { id: 1, role: 'user', content: 'a', parentId: null, createdAt: t },
        {
          id: 2,
          role: 'assistant',
          content: 'b1',
          parentId: 1,
          createdAt: new Date(t.getTime() + 1000),
        },
        {
          id: 3,
          role: 'assistant',
          content: 'b2',
          parentId: 1,
          createdAt: new Date(t.getTime() + 2000),
        },
      ]);

      const result = await ChatService.getHistory(1, 5, 10, 0);
      expect(result.total).toBe(2);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].content).toBe('b2');
      expect(result.messages[1].branches).toHaveLength(2);
    });

    it('returns sources on assistant messages from history', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 5 });
      const createdAt = new Date('2026-08-01T12:00:00Z');
      const assistantAt = new Date('2026-08-01T12:01:00Z');
      mockedPrisma.message.findMany.mockResolvedValue([
        {
          id: 1,
          role: 'user',
          content: 'q',
          parentId: null,
          createdAt,
          sources: null,
        },
        {
          id: 2,
          role: 'assistant',
          content: 'a',
          parentId: 1,
          createdAt: assistantAt,
          sources: [{ filename: 'doc.txt', similarity: 0.9 }],
        },
      ]);

      const result = await ChatService.getHistory(1, 5, 100, 0);
      expect(result.messages[1].sources).toEqual([
        { filename: 'doc.txt', similarity: 0.9 },
      ]);
    });

    it('returns tokenUsage on assistant messages and branches from history', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 5 });
      const createdAt = new Date('2026-08-01T12:00:00Z');
      const assistantAt1 = new Date('2026-08-01T12:01:00Z');
      const assistantAt2 = new Date('2026-08-01T12:02:00Z');
      const sampleUsage1 = {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        estimatedCostUsd: 0.0001,
      };
      const sampleUsage2 = {
        promptTokens: 15,
        completionTokens: 25,
        totalTokens: 40,
        estimatedCostUsd: 0.0002,
      };

      mockedPrisma.message.findMany.mockResolvedValue([
        {
          id: 1,
          role: 'user',
          content: 'prompt',
          parentId: null,
          createdAt,
          sources: null,
          tokenUsage: null,
        },
        {
          id: 2,
          role: 'assistant',
          content: 'branch 1',
          parentId: 1,
          createdAt: assistantAt1,
          sources: null,
          tokenUsage: sampleUsage1,
        },
        {
          id: 3,
          role: 'assistant',
          content: 'branch 2',
          parentId: 1,
          createdAt: assistantAt2,
          sources: null,
          tokenUsage: sampleUsage2,
        },
      ]);

      const result = await ChatService.getHistory(1, 5, 100, 0);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].tokenUsage).toEqual(sampleUsage2);
      expect(result.messages[1].token_usage).toEqual(sampleUsage2);
      expect(result.messages[1].branches).toHaveLength(2);
      expect(result.messages[1].branches?.[0].tokenUsage).toEqual(sampleUsage1);
      expect(result.messages[1].branches?.[0].token_usage).toEqual(sampleUsage1);
      expect(result.messages[1].branches?.[1].tokenUsage).toEqual(sampleUsage2);
    });

    it('logs and rethrows when Prisma history load fails', async () => {
      const logger = require('../logger');
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 5 });
      mockedPrisma.message.findMany.mockRejectedValue(new Error('db history'));
      await expect(ChatService.getHistory(1, 5, 100, 0)).rejects.toThrow(
        'db history'
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/getHistory failed.*db history/)
      );
    });
  });

  describe('searchMessages', () => {
    it('uses FTS via $queryRaw and scopes to user', async () => {
      const createdAt = new Date('2026-08-01T12:00:00Z');
      mockedPrisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          role: 'user',
          content: 'hello',
          created_at: createdAt,
          conversation_id: 3,
          conversation_title: 'T',
        },
      ]);

      const result = await ChatService.searchMessages(7, 'he', undefined);

      expect(mockedPrisma.$queryRaw).toHaveBeenCalled();
      expect(mockedPrisma.message.findMany).not.toHaveBeenCalled();
      expect(result.results[0]).toEqual({
        id: 1,
        role: 'user',
        content: 'hello',
        created_at: createdAt,
        conversation_id: 3,
        conversation_title: 'T',
      });
      expect(result.total).toBe(1);
    });

    it('includes matching conversation titles when searching globally', async () => {
      mockedPrisma.$queryRaw.mockResolvedValue([]);
      (mockedPrisma.conversation as any).findMany = jest.fn().mockResolvedValue([
        {
          id: 85,
          title: '111111111',
          createdAt: new Date('2026-11-01T15:00:00Z'),
          updatedAt: new Date('2026-11-01T15:00:00Z'),
        },
      ]);

      const result = await ChatService.searchMessages(3, '11111');
      expect(result.results).toEqual([
        expect.objectContaining({
          id: 'conv-85',
          conversation_id: 85,
          conversation_title: '111111111',
          role: 'conversation',
        }),
      ]);
      expect(result.total).toBe(1);
    });

    it('filters by conversationId when provided', async () => {
      mockedPrisma.$queryRaw.mockResolvedValue([]);
      await ChatService.searchMessages(1, 'ab', '12');
      expect(mockedPrisma.$queryRaw).toHaveBeenCalled();
      expect(mockedPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it('rejects invalid conversationId before querying', async () => {
      await expect(
        ChatService.searchMessages(1, 'ab', 'nope')
      ).rejects.toMatchObject({ statusCode: 400, message: 'Invalid conversationId' });
      expect(mockedPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('logs and rethrows when Prisma search fails', async () => {
      mockedPrisma.$queryRaw.mockRejectedValue(new Error('db search'));
      await expect(ChatService.searchMessages(1, 'ab')).rejects.toThrow(
        'db search'
      );
    });
  });

  describe('persistTurn', () => {
    it('stores sources on assistant message', async () => {
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2, createdAt: new Date() });

      await ChatService.persistTurn(5, 'q', 'a', {
        sources: [{ filename: 'doc.txt', similarity: 0.8 }],
      });

      expect(mockedPrisma.message.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          role: 'assistant',
          content: 'a',
          sources: [{ filename: 'doc.txt', similarity: 0.8 }],
        }),
      });
    });

    it('sets title from first user turn when conversation still has placeholder', async () => {
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2, createdAt: new Date() });
      mockedPrisma.conversation.findUnique.mockResolvedValue({
        title: 'Нова розмова',
      });

      await ChatService.persistTurn(5, 'Invoice totals for March', 'ok');

      expect(mockedPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: expect.objectContaining({
          title: 'Invoice totals for March',
        }),
      });
    });

    it('does not overwrite a custom conversation title', async () => {
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2, createdAt: new Date() });
      mockedPrisma.conversation.findUnique.mockResolvedValue({
        title: 'Already named',
      });

      await ChatService.persistTurn(5, 'Hello', 'ok');

      expect(mockedPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { updatedAt: expect.any(Date) },
      });
    });

    it('logs and rethrows when the transaction fails', async () => {
      mockedPrisma.$transaction.mockRejectedValue(new Error('tx fail'));
      await expect(
        ChatService.persistTurn(5, 'user', 'assistant')
      ).rejects.toThrow('tx fail');
    });
  });

  describe('prepareMessages', () => {
    it('injects memory after pinned prompts and before attachments', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedPrisma.userPrompt.findMany.mockResolvedValue([{ prompt: 'PIN' }]);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedBuildMemory.mockResolvedValue([
        { role: 'system', content: 'MEM_NOTE' },
        { role: 'system', content: 'MEM_SUMMARY' },
      ]);

      const prepared = await ChatService.prepareMessages({
        userId: 1,
        conversationId: 10,
        message: 'hi',
        options: { attachments: [{ filename: 'notes.txt', content: 'hello file' }] },
      });

      const contents = prepared.chatMessages.map((m) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      );
      const pinIdx = contents.findIndex((c) => c.includes('PIN'));
      const noteIdx = contents.findIndex((c) => c.includes('MEM_NOTE'));
      const summaryIdx = contents.findIndex((c) => c.includes('MEM_SUMMARY'));
      const attachmentIdx = contents.findIndex((c) =>
        c.includes('КОНТЕКСТ З ВКЛАДЕНЬ')
      );
      expect(pinIdx).toBeGreaterThanOrEqual(0);
      expect(noteIdx).toBeGreaterThan(pinIdx);
      expect(summaryIdx).toBeGreaterThan(noteIdx);
      expect(attachmentIdx).toBeGreaterThan(summaryIdx);
      expect(mockedBuildMemory).toHaveBeenCalledWith(10);
    });

    it('builds multimodal user message and strips image from options', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([
        {
          id: 9,
          role: 'assistant',
          content: 'prev',
          parentId: 8,
          createdAt: new Date(),
        },
      ]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);

      const prepared = await ChatService.prepareMessages({
        userId: 1,
        conversationId: 10,
        message: 'see this',
        options: { image: 'data:image/png;base64,abc', temperature: 0.2 },
      });

      expect(prepared.options.image).toBeUndefined();
      expect(prepared.options.temperature).toBe(0.2);
      expect(prepared.chatMessages.at(-1)).toEqual({
        role: 'user',
        content: [
          { type: 'text', text: 'see this' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
        ],
      });
    });
  });

  describe('streamMessage', () => {
    it('invokes provider stream and persists turn', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedProvider.streamMessage.mockImplementation(
        async (
          _p: string,
          _m: unknown,
          _model: string,
          _o: unknown,
          onToken: (t: string) => void
        ) => {
          onToken('A');
          onToken('B');
          return { content: 'AB' };
        }
      );
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 200, createdAt: new Date() });
      mockedPrisma.conversation.update.mockResolvedValue({});

      const tokens: string[] = [];
      const inits: number[] = [];
      const result = await ChatService.streamMessage(
        {
          userId: 1,
          conversationId: 10,
          message: 'Hi',
          options: {},
        },
        (t) => tokens.push(t),
        (id) => inits.push(id)
      );

      expect(inits).toEqual([10]);
      expect(tokens).toEqual(['A', 'B']);
      expect(result).toMatchObject({
        conversationId: 10,
        messageId: 200,
        content: 'AB',
      });
    });

    it('forwards AbortSignal into provider options', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedProvider.streamMessage.mockResolvedValue({ content: 'ok' });
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2, createdAt: new Date() });
      mockedPrisma.conversation.update.mockResolvedValue({});

      const ac = new AbortController();
      await ChatService.streamMessage(
        {
          userId: 1,
          conversationId: 10,
          message: 'Hi',
          options: { temperature: 0.2 },
          signal: ac.signal,
        },
        () => undefined
      );

      expect(mockedProvider.streamMessage.mock.calls[0][3]).toMatchObject({
        temperature: 0.2,
        signal: ac.signal,
      });
    });

    it('does not persist when provider stream fails', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedProvider.streamMessage.mockRejectedValue(new Error('stream down'));

      await expect(
        ChatService.streamMessage(
          { userId: 1, conversationId: 10, message: 'Hi', options: {} },
          () => {}
        )
      ).rejects.toThrow('stream down');
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns sources collected during RAG context build', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(true);
      mockedEmbed.generateEmbedding.mockResolvedValue([0.1]);
      mockedEmbed.findRelevantChunks.mockResolvedValue([
        { content: 'chunk', filename: 'a.txt', similarity: 0.9 },
      ]);
      mockedProvider.streamMessage.mockResolvedValue({ content: 'ok' });
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2, createdAt: new Date() });
      mockedPrisma.conversation.update.mockResolvedValue({});

      const result = await ChatService.streamMessage(
        {
          userId: 1,
          conversationId: 10,
          message: 'Hi',
          options: { ragEnabled: true },
        },
        () => undefined
      );

      expect(result.sources).toEqual([{ filename: 'a.txt', similarity: 0.9 }]);
    });

    it('merges provider grounding sources with RAG sources in streamMessage', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(true);
      mockedEmbed.generateEmbedding.mockResolvedValue([0.1]);
      mockedEmbed.findRelevantChunks.mockResolvedValue([
        { content: 'chunk', filename: 'rag.pdf', similarity: 0.9 },
      ]);
      mockedProvider.streamMessage.mockResolvedValue({
        content: 'stream ok',
        sources: [
          {
            id: 'web-0',
            filename: 'Wiki',
            url: 'https://wikipedia.org',
            source_type: 'web_search',
          },
        ],
      });
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2, createdAt: new Date() });
      mockedPrisma.conversation.update.mockResolvedValue({});

      const result = await ChatService.streamMessage(
        {
          userId: 1,
          conversationId: 10,
          message: 'Hi',
          provider: 'gemini',
          options: { ragEnabled: true },
        },
        () => undefined
      );

      expect(result.sources).toEqual([
        { filename: 'rag.pdf', similarity: 0.9 },
        {
          id: 'web-0',
          filename: 'Wiki',
          url: 'https://wikipedia.org',
          source_type: 'web_search',
        },
      ]);
    });

    it('emits token_usage SSE event and persists tokenUsage when stream completes with tokenUsage', async () => {
      mockedPrisma.conversation.findFirst.mockResolvedValue({ id: 10 });
      mockedPrisma.message.findMany.mockResolvedValue([]);
      mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
      mockedEmbed.isAvailable.mockReturnValue(false);
      const fakeTokenUsage = {
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
        estimatedCostUsd: 0.00001,
      };
      mockedProvider.streamMessage.mockImplementation(
        async (
          _p: string,
          _m: unknown,
          _model: string,
          _o: unknown,
          onToken: (t: string) => void
        ) => {
          onToken('Chunk');
          return { content: 'Chunk', tokenUsage: fakeTokenUsage };
        }
      );
      mockedPrisma.message.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 201, createdAt: new Date() });
      mockedPrisma.conversation.update.mockResolvedValue({});

      const mockRes = { write: jest.fn() };
      const tokens: string[] = [];
      const result = await ChatService.streamMessage(
        {
          userId: 1,
          conversationId: 10,
          message: 'Stream tokens',
          options: {},
          res: mockRes,
        },
        (t) => tokens.push(t)
      );

      expect(mockRes.write).toHaveBeenCalledWith(
        `event: token_usage\ndata: ${JSON.stringify(fakeTokenUsage)}\n\n`
      );
      expect(mockedPrisma.message.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'assistant',
            tokenUsage: fakeTokenUsage,
          }),
        })
      );
      expect(result.tokenUsage).toEqual(fakeTokenUsage);
    });
  });

  describe('persistAssistantMessage', () => {
    it('persists assistant message with sources and tokenUsage', async () => {
      const fakeTokenUsage = {
        promptTokens: 12,
        completionTokens: 6,
        totalTokens: 18,
        estimatedCostUsd: 0.00003,
      };
      const fakeSources = [{ filename: 'doc.pdf', similarity: 0.85 }];
      mockedPrisma.message.create.mockResolvedValue({
        id: 301,
        conversationId: 10,
        role: 'assistant',
        content: 'Assistant answer',
        sources: fakeSources,
        tokenUsage: fakeTokenUsage,
        parentId: 5,
      });

      const saved = await ChatService.persistAssistantMessage(
        10,
        'Assistant answer',
        fakeSources,
        fakeTokenUsage,
        5
      );

      expect(mockedPrisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 10,
          role: 'assistant',
          content: 'Assistant answer',
          sources: fakeSources,
          tokenUsage: fakeTokenUsage,
          parentId: 5,
        },
      });
      expect(saved.id).toBe(301);
    });
  });
});
