import prisma from '../config/prisma';
import logger from '../logger';
import ProviderFactory from './providerFactory';
import type { ChatMessage } from './chat/types';

export const MAX_NOTES = 20;
export const MAX_NOTE_CHARS = 500;
export const MAX_NOTES_PROMPT_CHARS = 2000;
export const MAX_SUMMARY_CHARS = 4000;

const DEFAULT_SUMMARY_THRESHOLD = 40;
const DEFAULT_SUMMARY_EVERY_N = 20;
const SUMMARY_RECENT_MESSAGES_CAP = 80;

export class MemoryError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'MemoryError';
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars);
}

async function ensureConversationAccess(userId: number, conversationId: number) {
  const owned = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true, summary: true, summaryUpdatedAt: true },
  });
  if (owned) return owned;
  throw new MemoryError(404, 'Conversation not found');
}

function assertValidNoteContent(content: string): string {
  const normalized = (content || '').trim();
  if (!normalized) throw new MemoryError(400, 'Note content is required');
  if (normalized.length > MAX_NOTE_CHARS) {
    throw new MemoryError(400, `Note content exceeds ${MAX_NOTE_CHARS} chars`);
  }
  return normalized;
}

export async function getMemory(userId: number, conversationId: number) {
  const conversation = await ensureConversationAccess(userId, conversationId);
  const notes = await prisma.conversationMemoryNote.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
  return {
    summary: conversation.summary,
    summaryUpdatedAt: conversation.summaryUpdatedAt,
    notes,
  };
}

export async function createNote(
  userId: number,
  conversationId: number,
  content: string
) {
  await ensureConversationAccess(userId, conversationId);
  const normalized = assertValidNoteContent(content);

  const noteCount = await prisma.conversationMemoryNote.count({
    where: { conversationId },
  });
  if (noteCount >= MAX_NOTES) {
    throw new MemoryError(409, `Max ${MAX_NOTES} notes reached`);
  }

  return prisma.conversationMemoryNote.create({
    data: { conversationId, content: normalized },
  });
}

export async function updateNote(
  userId: number,
  conversationId: number,
  noteId: number,
  content: string
) {
  await ensureConversationAccess(userId, conversationId);
  const normalized = assertValidNoteContent(content);

  const note = await prisma.conversationMemoryNote.findFirst({
    where: { id: noteId, conversationId },
    select: { id: true },
  });
  if (!note) throw new MemoryError(404, 'Note not found');

  return prisma.conversationMemoryNote.update({
    where: { id: noteId },
    data: { content: normalized },
  });
}

export async function deleteNote(
  userId: number,
  conversationId: number,
  noteId: number
) {
  await ensureConversationAccess(userId, conversationId);
  const deleted = await prisma.conversationMemoryNote.deleteMany({
    where: { id: noteId, conversationId },
  });
  if (deleted.count === 0) throw new MemoryError(404, 'Note not found');
}

export async function buildMemorySystemMessages(
  conversationId: number
): Promise<ChatMessage[]> {
  const [notes, conversation] = await Promise.all([
    prisma.conversationMemoryNote.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { content: true },
    }),
    prisma.conversation.findFirst({
      where: { id: conversationId },
      select: { summary: true },
    }),
  ]);

  const systemMessages: ChatMessage[] = [];

  // Order: conversation summary, then conversation notes (user notes injected earlier).
  if (conversation?.summary) {
    systemMessages.push({
      role: 'system',
      content: `🧾 ПІДСУМОК РОЗМОВИ:\n\n${truncate(
        conversation.summary,
        MAX_SUMMARY_CHARS
      )}`,
    });
  }

  if (notes.length > 0) {
    const notesPrefix = "🧠 НОТАТКИ ПАМ'ЯТІ:\n\n";
    const maxNotesBodyChars = Math.max(
      0,
      MAX_NOTES_PROMPT_CHARS - notesPrefix.length
    );
    const notesBody = notes.map((n) => `- ${n.content}`).join('\n');
    systemMessages.push({
      role: 'system',
      content: `${notesPrefix}${truncate(notesBody, maxNotesBodyChars)}`,
    });
  }

  return systemMessages;
}

export async function maybeRefreshSummary(
  userId: number,
  conversationId: number,
  opts: { force?: boolean } = {}
): Promise<{ refreshed: boolean }> {
  try {
    const conversation = await ensureConversationAccess(userId, conversationId);
    const force = Boolean(opts.force);
    const summaryThreshold = parsePositiveInt(
      process.env.SUMMARY_THRESHOLD,
      DEFAULT_SUMMARY_THRESHOLD
    );
    const summaryEveryN = parsePositiveInt(
      process.env.SUMMARY_EVERY_N,
      DEFAULT_SUMMARY_EVERY_N
    );

    const totalMessages = await prisma.message.count({ where: { conversationId } });
    if (!force && totalMessages <= summaryThreshold) return { refreshed: false };

    if (!force) {
      let messagesSince = totalMessages;
      if (conversation.summaryUpdatedAt) {
        messagesSince = await prisma.message.count({
          where: {
            conversationId,
            createdAt: { gt: conversation.summaryUpdatedAt },
          },
        });
      }
      if (messagesSince < summaryEveryN) return { refreshed: false };
    }

    const recentMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: SUMMARY_RECENT_MESSAGES_CAP,
      select: { role: true, content: true },
    });
    if (recentMessages.length === 0) return { refreshed: false };

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { defaultProvider: true, defaultModel: true },
    });
    const provider = settings?.defaultProvider || 'openai';
    const model = settings?.defaultModel || 'gpt-3.5-turbo';

    const summarizeMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          "Ти стисло підсумовуєш розмову українською. Поверни один щільний підсумок для продовження діалогу: факти, рішення, домовленості, контекст задач, відкриті питання.",
      },
      {
        role: 'user',
        content: recentMessages
          .reverse()
          .map((m) => `[${m.role}] ${m.content}`)
          .join('\n'),
      },
    ];

    const result = await ProviderFactory.sendMessage(
      provider,
      summarizeMessages,
      model,
      {}
    );
    const summary = truncate((result?.content || '').trim(), MAX_SUMMARY_CHARS);
    if (!summary) return { refreshed: false };

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        summary,
        summaryUpdatedAt: new Date(),
      },
    });
    return { refreshed: true };
  } catch (error: unknown) {
    if (error instanceof MemoryError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `conversationMemoryService.maybeRefreshSummary skipped: ${message}`
    );
    return { refreshed: false };
  }
}
