import prisma from '../config/prisma';
import type { ChatMessage } from './chat/types';

export const MAX_USER_NOTES = 30;
export const MAX_USER_NOTE_CHARS = 500;
export const MAX_USER_NOTES_PROMPT_CHARS = 2000;

export class UserMemoryError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'UserMemoryError';
  }
}

function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars);
}

function assertValidNoteContent(content: string): string {
  const normalized = (content || '').trim();
  if (!normalized) throw new UserMemoryError(400, 'Note content is required');
  if (normalized.length > MAX_USER_NOTE_CHARS) {
    throw new UserMemoryError(
      400,
      `Note content exceeds ${MAX_USER_NOTE_CHARS} chars`
    );
  }
  return normalized;
}

export async function listNotes(userId: number) {
  return prisma.userMemoryNote.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createNote(userId: number, content: string) {
  const normalized = assertValidNoteContent(content);
  const noteCount = await prisma.userMemoryNote.count({ where: { userId } });
  if (noteCount >= MAX_USER_NOTES) {
    throw new UserMemoryError(409, `Max ${MAX_USER_NOTES} notes reached`);
  }
  return prisma.userMemoryNote.create({
    data: { userId, content: normalized },
  });
}

export async function updateNote(
  userId: number,
  noteId: number,
  content: string
) {
  const normalized = assertValidNoteContent(content);
  const existing = await prisma.userMemoryNote.findFirst({
    where: { id: noteId, userId },
    select: { id: true },
  });
  if (!existing) throw new UserMemoryError(404, 'Note not found');
  return prisma.userMemoryNote.update({
    where: { id: noteId },
    data: { content: normalized },
  });
}

export async function deleteNote(userId: number, noteId: number) {
  const deleted = await prisma.userMemoryNote.deleteMany({
    where: { id: noteId, userId },
  });
  if (deleted.count === 0) throw new UserMemoryError(404, 'Note not found');
}

export async function buildUserMemorySystemMessages(
  userId: number
): Promise<ChatMessage[]> {
  const notes = await prisma.userMemoryNote.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { content: true },
  });
  if (notes.length === 0) return [];

  const prefix = "👤 НОТАТКИ КОРИСТУВАЧА:\n\n";
  const maxBody = Math.max(0, MAX_USER_NOTES_PROMPT_CHARS - prefix.length);
  const body = notes.map((n) => `- ${n.content}`).join('\n');
  return [
    {
      role: 'system',
      content: `${prefix}${truncate(body, maxBody)}`,
    },
  ];
}
