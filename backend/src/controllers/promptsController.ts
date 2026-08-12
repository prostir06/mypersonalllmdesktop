import { Response } from 'express';
import prisma from '../config/prisma';
import logger from '../logger';
import { jsonError } from '../utils/httpJson';
import type { AuthRequest } from '../types/express';

type UserPromptRow = {
  id: number;
  userId: number;
  title: string;
  prompt: string;
  isPinned: boolean;
  createdAt: Date;
};

export function parsePromptId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

export function toPublicPrompt(row: UserPromptRow) {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    is_pinned: row.isPinned,
    created_at: row.createdAt,
  };
}

export async function listPrompts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rows = await prisma.userPrompt.findMany({
      where: { userId: req.userId! },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(rows.map(toPublicPrompt));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /prompts error: ${message}`);
    jsonError(res, req, 500, 'Failed to fetch prompts');
  }
}

export async function createPrompt(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as {
    title?: string;
    prompt?: string;
    isPinned?: boolean;
    is_pinned?: boolean;
  };

  if (typeof body.title !== 'string' || !body.title.trim()) {
    jsonError(res, req, 400, 'title is required');
    return;
  }
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
    jsonError(res, req, 400, 'prompt is required');
    return;
  }
  if (body.title.length > 255) {
    jsonError(res, req, 400, 'title too long (max 255 characters)');
    return;
  }
  if (body.prompt.length > 8000) {
    jsonError(res, req, 400, 'prompt too long (max 8000 characters)');
    return;
  }

  const isPinned = Boolean(body.isPinned ?? body.is_pinned);

  try {
    const row = await prisma.userPrompt.create({
      data: {
        userId: req.userId!,
        title: body.title.trim(),
        prompt: body.prompt.trim(),
        isPinned,
      },
    });
    res.status(201).json(toPublicPrompt(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /prompts error: ${message}`);
    jsonError(res, req, 500, 'Failed to create prompt');
  }
}

export async function updatePrompt(req: AuthRequest, res: Response): Promise<void> {
  const id = parsePromptId(String(req.params.promptId));
  if (id == null) {
    jsonError(res, req, 404, 'Prompt not found');
    return;
  }

  const body = req.body as {
    title?: string;
    prompt?: string;
    isPinned?: boolean;
    is_pinned?: boolean;
  };

  const data: { title?: string; prompt?: string; isPinned?: boolean } = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      jsonError(res, req, 400, 'title must be a non-empty string');
      return;
    }
    if (body.title.length > 255) {
      jsonError(res, req, 400, 'title too long (max 255 characters)');
      return;
    }
    data.title = body.title.trim();
  }
  if (body.prompt !== undefined) {
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
      jsonError(res, req, 400, 'prompt must be a non-empty string');
      return;
    }
    if (body.prompt.length > 8000) {
      jsonError(res, req, 400, 'prompt too long (max 8000 characters)');
      return;
    }
    data.prompt = body.prompt.trim();
  }
  if (body.isPinned !== undefined || body.is_pinned !== undefined) {
    data.isPinned = Boolean(body.isPinned ?? body.is_pinned);
  }

  if (Object.keys(data).length === 0) {
    jsonError(res, req, 400, 'No fields to update');
    return;
  }

  try {
    const existing = await prisma.userPrompt.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!existing) {
      jsonError(res, req, 404, 'Prompt not found');
      return;
    }

    const row = await prisma.userPrompt.update({
      where: { id },
      data,
    });
    res.json(toPublicPrompt(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`PUT /prompts/${req.params.promptId} error: ${message}`);
    jsonError(res, req, 500, 'Failed to update prompt');
  }
}

export async function deletePrompt(req: AuthRequest, res: Response): Promise<void> {
  const id = parsePromptId(String(req.params.promptId));
  if (id == null) {
    jsonError(res, req, 404, 'Prompt not found');
    return;
  }

  try {
    const existing = await prisma.userPrompt.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!existing) {
      jsonError(res, req, 404, 'Prompt not found');
      return;
    }

    await prisma.userPrompt.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`DELETE /prompts/${req.params.promptId} error: ${message}`);
    jsonError(res, req, 500, 'Failed to delete prompt');
  }
}
