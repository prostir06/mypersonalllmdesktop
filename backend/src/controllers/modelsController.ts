import { Request, Response } from 'express';
import logger from '../logger';
import { jsonError } from '../utils/httpJson';
import type { AuthRequest } from '../types/express';
import * as ModelsService from '../services/modelsService';

export async function listModels(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rows = await ModelsService.listForUser(req.userId!);
    res.json(rows.map(ModelsService.toPublicModel));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /models error: ${message}`);
    jsonError(res, req, 500, 'Failed to fetch models');
  }
}

export async function createModel(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as {
    name?: string;
    modelId?: string;
    description?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: string;
  };

  if (
    typeof body.name !== 'string' ||
    !body.name.trim() ||
    typeof body.modelId !== 'string' ||
    !body.modelId.trim()
  ) {
    jsonError(res, req, 400, 'name and modelId are required');
    return;
  }

  try {
    const row = await ModelsService.createForUser(req.userId!, {
      name: body.name,
      modelId: body.modelId,
      description: body.description,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      provider: body.provider,
    });
    res.status(201).json(ModelsService.toPublicModel(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /models error: ${message}`);
    jsonError(res, req, 500, 'Failed to create model');
  }
}

export async function updateModel(req: AuthRequest, res: Response): Promise<void> {
  const id = ModelsService.parseModelId(String(req.params.modelId));
  if (id == null) {
    jsonError(res, req, 404, 'Model not found');
    return;
  }

  const body = req.body as {
    name?: string;
    description?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: string;
  };

  try {
    const row = await ModelsService.updateForUser(req.userId!, id, body);
    if (!row) {
      jsonError(res, req, 404, 'Model not found');
      return;
    }
    res.json(ModelsService.toPublicModel(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`PUT /models/${req.params.modelId} error: ${message}`);
    jsonError(res, req, 500, 'Failed to update model');
  }
}

export async function deleteModel(req: AuthRequest, res: Response): Promise<void> {
  const id = ModelsService.parseModelId(String(req.params.modelId));
  if (id == null) {
    jsonError(res, req, 404, 'Model not found');
    return;
  }

  try {
    const result = await ModelsService.deleteForUser(req.userId!, id);
    if (result.count === 0) {
      jsonError(res, req, 404, 'Model not found');
      return;
    }
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`DELETE /models/${req.params.modelId} error: ${message}`);
    jsonError(res, req, 500, 'Failed to delete model');
  }
}

export async function listRemoteModels(req: Request, res: Response): Promise<void> {
  const { provider, host } = req.query as { provider?: string; host?: string };

  if (!provider) {
    jsonError(res, req, 400, 'provider is required');
    return;
  }

  try {
    if ((provider || '').toLowerCase() !== 'ollama') {
      jsonError(res, req, 400, 'Unsupported provider for remote discovery');
      return;
    }

    const models = await ModelsService.discoverRemoteOllamaModels(host);
    res.json(models);
  } catch (error: unknown) {
    if (error instanceof ModelsService.RemoteModelsError) {
      jsonError(res, req, error.statusCode, error.message);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /models/remote error: ${message}`);
    jsonError(res, req, 500, 'Failed to fetch remote models');
  }
}
