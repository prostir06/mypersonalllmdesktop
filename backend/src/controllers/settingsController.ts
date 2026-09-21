import { Response } from 'express';
import { jsonError } from '../utils/httpJson';
import { EncryptionConfigError } from '../utils/secretCrypto';
import logger from '../logger';
import type { AuthRequest } from '../types/express';
import {
  getSettingsForUser,
  updateSettingsForUser,
  InvalidOpenAiKeyError,
} from '../services/settingsService';

type SettingsRequest = AuthRequest;

export async function getSettings(
  req: SettingsRequest,
  res: Response
): Promise<void> {
  try {
    res.json(await getSettingsForUser(req.userId));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in GET /settings: ${message}`);
    jsonError(res, req, 500, 'Failed to fetch settings');
  }
}

export async function updateSettings(
  req: SettingsRequest,
  res: Response
): Promise<void> {
  if (!req.userId) {
    jsonError(res, req, 401, 'No token, authorization denied');
    return;
  }

  try {
    res.json(await updateSettingsForUser(req.userId, req.body));
  } catch (error: unknown) {
    if (error instanceof InvalidOpenAiKeyError) {
      jsonError(res, req, 400, error.message);
      return;
    }
    if (error instanceof EncryptionConfigError) {
      jsonError(res, req, 503, 'Помилка конфігурації шифрування');
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in PUT /settings: ${message}`);
    jsonError(res, req, 500, 'Failed to update settings');
  }
}
