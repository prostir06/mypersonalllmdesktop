jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    conversation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    conversationMemoryNote: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
    message: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    userSettings: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../services/providerFactory', () => ({
  __esModule: true,
  default: {
    sendMessage: jest.fn(),
  },
}));

jest.mock('../logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

import prisma from '../config/prisma';
import logger from '../logger';
import ProviderFactory from '../services/providerFactory';
import {
  MAX_NOTE_CHARS,
  MAX_NOTES,
  MAX_NOTES_PROMPT_CHARS,
  MAX_SUMMARY_CHARS,
  buildMemorySystemMessages,
  createNote,
  maybeRefreshSummary,
} from '../services/conversationMemoryService';

const mockedPrisma = prisma as unknown as {
  conversation: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  conversationMemoryNote: {
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
  };
  message: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  userSettings: {
    findUnique: jest.Mock;
  };
};

const mockedProviderFactory = ProviderFactory as unknown as {
  sendMessage: jest.Mock;
};

const mockedLogger = logger as unknown as {
  warn: jest.Mock;
};

describe('conversationMemoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SUMMARY_THRESHOLD;
    delete process.env.SUMMARY_EVERY_N;
    mockedPrisma.conversation.findFirst.mockResolvedValue({
      id: 7,
      userId: 9,
      summary: null,
      summaryUpdatedAt: null,
    });
  });

  it('exports exact caps', () => {
    expect(MAX_NOTES).toBe(20);
    expect(MAX_NOTE_CHARS).toBe(500);
    expect(MAX_NOTES_PROMPT_CHARS).toBe(2000);
    expect(MAX_SUMMARY_CHARS).toBe(4000);
  });

  it('returns 409 when creating note at MAX_NOTES', async () => {
    mockedPrisma.conversationMemoryNote.count.mockResolvedValue(MAX_NOTES);
    await expect(createNote(9, 7, 'note')).rejects.toMatchObject({ statusCode: 409 });
    expect(mockedPrisma.conversationMemoryNote.create).not.toHaveBeenCalled();
  });

  it('returns 400 when note content exceeds 500 chars', async () => {
    mockedPrisma.conversationMemoryNote.count.mockResolvedValue(0);
    await expect(createNote(9, 7, 'x'.repeat(501))).rejects.toMatchObject({ statusCode: 400 });
  });

  it('buildMemorySystemMessages emits notes block before summary block', async () => {
    mockedPrisma.conversationMemoryNote.findMany.mockResolvedValue([
      { id: 1, content: 'A', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      { id: 2, content: 'B', createdAt: new Date('2026-01-01T00:00:01.000Z') },
    ]);
    mockedPrisma.conversation.findFirst.mockResolvedValue({
      id: 7,
      userId: 9,
      summary: 'SUM',
      summaryUpdatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const messages = await buildMemorySystemMessages(7);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'system' });
    expect(messages[1]).toMatchObject({ role: 'system' });
    expect(messages[0].content).toContain("🧠 НОТАТКИ ПАМ'ЯТІ:");
    expect(messages[1].content).toContain('🧾 ПІДСУМОК РОЗМОВИ:');
    expect(messages[0].content).toContain('A');
    expect(messages[0].content).toContain('B');
    expect(messages[1].content).toContain('SUM');
  });

  it('caps notes prompt block to <= 2000 chars', async () => {
    mockedPrisma.conversationMemoryNote.findMany.mockResolvedValue([
      { id: 1, content: 'x'.repeat(2100), createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const messages = await buildMemorySystemMessages(7);
    expect(messages[0].content.length).toBeLessThanOrEqual(MAX_NOTES_PROMPT_CHARS);
  });

  it('does not summarize when message count is <= default threshold', async () => {
    mockedPrisma.message.count.mockResolvedValue(40);
    const result = await maybeRefreshSummary(9, 7);
    expect(result).toEqual({ refreshed: false });
    expect(mockedProviderFactory.sendMessage).not.toHaveBeenCalled();
    expect(mockedPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it('does not summarize for non-force when messagesSince < SUMMARY_EVERY_N', async () => {
    process.env.SUMMARY_THRESHOLD = '10';
    process.env.SUMMARY_EVERY_N = '20';
    const summaryUpdatedAt = new Date('2026-01-03T00:00:00.000Z');

    mockedPrisma.conversation.findFirst.mockResolvedValue({
      id: 7,
      userId: 9,
      summary: 'existing',
      summaryUpdatedAt,
    });
    mockedPrisma.message.count
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(5);

    const result = await maybeRefreshSummary(9, 7);

    expect(result).toEqual({ refreshed: false });
    expect(mockedPrisma.message.findMany).not.toHaveBeenCalled();
    expect(mockedProviderFactory.sendMessage).not.toHaveBeenCalled();
    expect(mockedPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it('summarizes and truncates to 4k when force=true', async () => {
    mockedPrisma.message.count.mockResolvedValue(100);
    mockedPrisma.message.findMany.mockResolvedValue([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
    ]);
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o-mini',
    });
    mockedProviderFactory.sendMessage.mockResolvedValue({
      content: 'y'.repeat(4500),
    });

    const result = await maybeRefreshSummary(9, 7, { force: true });

    expect(result).toEqual({ refreshed: true });
    expect(mockedProviderFactory.sendMessage).toHaveBeenCalled();
    expect(mockedPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({
        summary: 'y'.repeat(4000),
        summaryUpdatedAt: expect.any(Date),
      }),
    });
  });

  it('swallows summarize errors and logs warn', async () => {
    mockedPrisma.message.count.mockResolvedValue(100);
    mockedPrisma.message.findMany.mockResolvedValue([
      { role: 'user', content: 'hello' },
    ]);
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o-mini',
    });
    mockedProviderFactory.sendMessage.mockRejectedValue(new Error('llm-down'));

    await expect(maybeRefreshSummary(9, 7, { force: true })).resolves.toEqual({
      refreshed: false,
    });
    expect(mockedLogger.warn).toHaveBeenCalled();
  });

  it('rethrows MemoryError access failures', async () => {
    mockedPrisma.conversation.findFirst.mockResolvedValueOnce(null);

    await expect(maybeRefreshSummary(9, 7, { force: true })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Conversation not found',
    });
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });
});
