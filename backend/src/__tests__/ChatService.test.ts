jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    conversation: {
      create: jest.fn(),
      findFirst: jest.fn(),
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
  isAvailable: jest.fn(),
  generateEmbedding: jest.fn(),
  findRelevantChunks: jest.fn(),
}));

jest.mock('../services/providerFactory', () => ({
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
}));

jest.mock('../services/embeddings/resolveEmbeddingContext', () => ({
  resolveEmbeddingContext: jest.fn(),
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
import { resolveEmbeddingContext } from '../services/embeddings/resolveEmbeddingContext';

const mockedPrisma = prisma as any;
const mockedEmbed = EmbeddingService as any;
const mockedProvider = ProviderFactory as any;
const mockedResolveCtx = resolveEmbeddingContext as jest.Mock;

describe('ChatService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveCtx.mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-test',
    });
    mockedPrisma.userPrompt.findMany.mockResolvedValue([]);
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
      mockedPrisma.message.findMany.mockResolvedValue(rows);

      const msgs = await ChatService.loadRecentMessages(1);

      expect(mockedPrisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 1 },
        orderBy: { createdAt: 'asc' },
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
  });

  describe('buildSystemContext', () => {
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
        { ragEnabled: true },
        'query'
      );

      expect(mockedEmbed.findRelevantChunks).toHaveBeenCalledWith(
        [0.1],
        1,
        [],
        5,
        {},
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

      const msgs = await ChatService.buildSystemContext(
        1,
        { ragEnabled: true },
        'q'
      );
      expect(msgs).toEqual([{ role: 'system', content: 'Keep going' }]);
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
    it('logs and rethrows when the transaction fails', async () => {
      mockedPrisma.$transaction.mockRejectedValue(new Error('tx fail'));
      await expect(
        ChatService.persistTurn(5, 'user', 'assistant')
      ).rejects.toThrow('tx fail');
    });
  });

  describe('prepareMessages', () => {
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
  });
});
