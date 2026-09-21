import { Response } from 'express';
import logger from '../logger';
import { jsonError } from '../utils/httpJson';
import type { AuthRequest } from '../types/express';
import { parseConversationId } from '../services/conversationsService';
import {
  MemoryError,
  createNote,
  deleteNote,
  getMemory as getConversationMemory,
  maybeRefreshSummary,
  updateNote,
} from '../services/conversationMemoryService';

type MemoryNoteRow = {
  id: number;
  conversationId: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

function parseNoteId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function toPublicMemoryNote(note: MemoryNoteRow) {
  return {
    id: note.id,
    conversation_id: note.conversationId,
    content: note.content,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

function handleMemoryError(
  req: AuthRequest,
  res: Response,
  error: unknown,
  logPrefix: string,
  fallbackMessage: string
) {
  if (error instanceof MemoryError) {
    jsonError(res, req, error.statusCode, error.message);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`${logPrefix}: ${message}`);
  jsonError(res, req, 500, fallbackMessage);
}

export async function getMemory(req: AuthRequest, res: Response): Promise<void> {
  const conversationId = parseConversationId(String(req.params.conversationId));
  if (conversationId == null) {
    jsonError(res, req, 404, 'Conversation not found');
    return;
  }

  try {
    const memory = await getConversationMemory(req.userId!, conversationId);
    res.json({
      summary: memory.summary,
      summary_updated_at: memory.summaryUpdatedAt,
      notes: memory.notes.map((note) => toPublicMemoryNote(note as MemoryNoteRow)),
    });
  } catch (error: unknown) {
    handleMemoryError(
      req,
      res,
      error,
      `GET /conversations/${req.params.conversationId}/memory error`,
      'Failed to fetch memory'
    );
  }
}

export async function createMemoryNote(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const conversationId = parseConversationId(String(req.params.conversationId));
  if (conversationId == null) {
    jsonError(res, req, 404, 'Conversation not found');
    return;
  }

  const content = String((req.body as { content?: unknown })?.content || '');

  try {
    const note = await createNote(req.userId!, conversationId, content);
    res.status(201).json(toPublicMemoryNote(note as MemoryNoteRow));
  } catch (error: unknown) {
    handleMemoryError(
      req,
      res,
      error,
      `POST /conversations/${req.params.conversationId}/memory-notes error`,
      'Failed to create memory note'
    );
  }
}

export async function updateMemoryNote(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const conversationId = parseConversationId(String(req.params.conversationId));
  const noteId = parseNoteId(String(req.params.noteId));
  if (conversationId == null || noteId == null) {
    jsonError(res, req, 404, 'Note not found');
    return;
  }

  const content = String((req.body as { content?: unknown })?.content || '');

  try {
    const note = await updateNote(req.userId!, conversationId, noteId, content);
    res.json(toPublicMemoryNote(note as MemoryNoteRow));
  } catch (error: unknown) {
    handleMemoryError(
      req,
      res,
      error,
      `PATCH /conversations/${req.params.conversationId}/memory-notes/${req.params.noteId} error`,
      'Failed to update memory note'
    );
  }
}

export async function deleteMemoryNote(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const conversationId = parseConversationId(String(req.params.conversationId));
  const noteId = parseNoteId(String(req.params.noteId));
  if (conversationId == null || noteId == null) {
    jsonError(res, req, 404, 'Note not found');
    return;
  }

  try {
    await deleteNote(req.userId!, conversationId, noteId);
    res.json({ success: true });
  } catch (error: unknown) {
    handleMemoryError(
      req,
      res,
      error,
      `DELETE /conversations/${req.params.conversationId}/memory-notes/${req.params.noteId} error`,
      'Failed to delete memory note'
    );
  }
}

export async function refreshSummary(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const conversationId = parseConversationId(String(req.params.conversationId));
  if (conversationId == null) {
    jsonError(res, req, 404, 'Conversation not found');
    return;
  }

  try {
    const refreshResult = await maybeRefreshSummary(req.userId!, conversationId, {
      force: true,
    });
    res.json({ success: true, refreshed: refreshResult.refreshed });
  } catch (error: unknown) {
    handleMemoryError(
      req,
      res,
      error,
      `POST /conversations/${req.params.conversationId}/memory/refresh-summary error`,
      'Failed to refresh summary'
    );
  }
}
