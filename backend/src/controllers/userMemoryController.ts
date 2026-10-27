import { Response } from 'express';
import logger from '../logger';
import { jsonError } from '../utils/httpJson';
import type { AuthRequest } from '../types/express';
import {
  UserMemoryError,
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from '../services/userMemoryService';

type UserMemoryNoteRow = {
  id: number;
  userId: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

function parseNoteId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function toPublicNote(note: UserMemoryNoteRow) {
  return {
    id: note.id,
    user_id: note.userId,
    content: note.content,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

function handleError(
  req: AuthRequest,
  res: Response,
  error: unknown,
  logPrefix: string,
  fallbackMessage: string
) {
  if (error instanceof UserMemoryError) {
    jsonError(res, req, error.statusCode, error.message);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`${logPrefix}: ${message}`);
  jsonError(res, req, 500, fallbackMessage);
}

export async function listUserMemoryNotes(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const notes = await listNotes(req.userId!);
    res.json({ notes: notes.map((n) => toPublicNote(n as UserMemoryNoteRow)) });
  } catch (error: unknown) {
    handleError(
      req,
      res,
      error,
      'GET /users/me/memory-notes error',
      'Failed to fetch user memory notes'
    );
  }
}

export async function createUserMemoryNote(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const note = await createNote(req.userId!, String(req.body?.content ?? ''));
    res.status(201).json(toPublicNote(note as UserMemoryNoteRow));
  } catch (error: unknown) {
    handleError(
      req,
      res,
      error,
      'POST /users/me/memory-notes error',
      'Failed to create user memory note'
    );
  }
}

export async function updateUserMemoryNote(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const noteId = parseNoteId(String(req.params.noteId));
  if (noteId == null) {
    jsonError(res, req, 404, 'Note not found');
    return;
  }
  try {
    const note = await updateNote(
      req.userId!,
      noteId,
      String(req.body?.content ?? '')
    );
    res.json(toPublicNote(note as UserMemoryNoteRow));
  } catch (error: unknown) {
    handleError(
      req,
      res,
      error,
      `PATCH /users/me/memory-notes/${req.params.noteId} error`,
      'Failed to update user memory note'
    );
  }
}

export async function deleteUserMemoryNote(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const noteId = parseNoteId(String(req.params.noteId));
  if (noteId == null) {
    jsonError(res, req, 404, 'Note not found');
    return;
  }
  try {
    await deleteNote(req.userId!, noteId);
    res.status(204).send();
  } catch (error: unknown) {
    handleError(
      req,
      res,
      error,
      `DELETE /users/me/memory-notes/${req.params.noteId} error`,
      'Failed to delete user memory note'
    );
  }
}
