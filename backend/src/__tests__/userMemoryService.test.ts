jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    userMemoryNote: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

import prisma from '../config/prisma';
import {
  MAX_USER_NOTE_CHARS,
  MAX_USER_NOTES,
  MAX_USER_NOTES_PROMPT_CHARS,
  UserMemoryError,
  buildUserMemorySystemMessages,
  createNote,
  deleteNote,
  updateNote,
} from '../services/userMemoryService';

const mockedPrisma = prisma as unknown as {
  userMemoryNote: {
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
  };
};

describe('userMemoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports exact caps', () => {
    expect(MAX_USER_NOTES).toBe(30);
    expect(MAX_USER_NOTE_CHARS).toBe(500);
    expect(MAX_USER_NOTES_PROMPT_CHARS).toBe(2000);
  });

  it('rejects empty and too-long create content', async () => {
    await expect(createNote(1, '  ')).rejects.toMatchObject({
      statusCode: 400,
    } satisfies Partial<UserMemoryError>);
    await expect(
      createNote(1, 'x'.repeat(MAX_USER_NOTE_CHARS + 1))
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('enforces max notes on create', async () => {
    mockedPrisma.userMemoryNote.count.mockResolvedValue(MAX_USER_NOTES);
    await expect(createNote(1, 'ok')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockedPrisma.userMemoryNote.create).not.toHaveBeenCalled();
  });

  it('update/delete return 404 for missing ownership', async () => {
    mockedPrisma.userMemoryNote.findFirst.mockResolvedValue(null);
    await expect(updateNote(1, 9, 'next')).rejects.toMatchObject({
      statusCode: 404,
    });
    mockedPrisma.userMemoryNote.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteNote(1, 9)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('buildUserMemorySystemMessages prefixes and truncates', async () => {
    mockedPrisma.userMemoryNote.findMany.mockResolvedValue([
      { content: 'a'.repeat(3000) },
    ]);
    const messages = await buildUserMemorySystemMessages(3);
    expect(messages).toHaveLength(1);
    const content = String(messages[0].content);
    expect(content.startsWith('👤 НОТАТКИ КОРИСТУВАЧА:')).toBe(true);
    expect(content.length).toBeLessThanOrEqual(MAX_USER_NOTES_PROMPT_CHARS);
  });
});
