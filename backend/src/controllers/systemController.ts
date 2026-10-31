import type { Request, Response, NextFunction } from 'express';
import {
  getSystemKnowledgeForUser,
  type SnapshotOverrides,
} from '../services/systemKnowledge';
import { jsonError } from '../utils/httpJson';

export interface AuthenticatedRequest extends Request {
  userId?: number;
  user?: {
    id: number;
    [key: string]: unknown;
  };
}

export async function getSystemKnowledge(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id ?? authReq.userId;

    if (!userId) {
      jsonError(res, req, 401, 'No token, authorization denied');
      return;
    }

    const { provider, model, selectedDocCount, webSearchEnabled } = req.query;

    const trimmedProvider =
      typeof provider === 'string' && provider.trim().length > 0
        ? provider.trim()
        : undefined;

    const trimmedModel =
      typeof model === 'string' && model.trim().length > 0
        ? model.trim()
        : undefined;

    let parsedDocCount: number | undefined;
    if (typeof selectedDocCount === 'string' && selectedDocCount.trim() !== '') {
      const parsed = Number(selectedDocCount.trim());
      if (Number.isInteger(parsed) && parsed >= 0) {
        parsedDocCount = parsed;
      }
    } else if (
      typeof selectedDocCount === 'number' &&
      Number.isInteger(selectedDocCount) &&
      selectedDocCount >= 0
    ) {
      parsedDocCount = selectedDocCount;
    }

    let parsedWebSearch: boolean | undefined;
    if (webSearchEnabled === 'true') {
      parsedWebSearch = true;
    } else if (webSearchEnabled === 'false') {
      parsedWebSearch = false;
    }

    const overrides: SnapshotOverrides = {
      provider: trimmedProvider,
      model: trimmedModel,
      selectedDocCount: parsedDocCount,
      webSearchEnabled: parsedWebSearch,
    };

    const payload = await getSystemKnowledgeForUser(userId, overrides);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}
