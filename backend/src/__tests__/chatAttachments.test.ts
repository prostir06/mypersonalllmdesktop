/**
 * @jest-environment node
 */
jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../services/documents/extraction', () => ({
  extractText: jest.fn().mockResolvedValue('hello attachment'),
}));

import fs from 'fs';
import type { Response } from 'express';
import logger from '../logger';
import { extractText } from '../services/documents/extraction';
import { uploadChatAttachment } from '../controllers/chatAttachmentsController';
import type { AuthRequest } from '../types/express';

describe('uploadChatAttachment cleanup', () => {
  const tmpPath = 'D:\\tmp\\chat-attach-test.txt';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('hello'));
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
  }

  it('unlinks temp file after success', async () => {
    const req = {
      id: 'rid-1',
      userId: 1,
      file: {
        path: tmpPath,
        mimetype: 'text/plain',
        originalname: 'a.txt',
      },
    } as AuthRequest & { file: { path: string; mimetype: string; originalname: string } };
    const res = mockRes();

    await uploadChatAttachment(req, res);

    expect(extractText).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'a.txt', content: 'hello attachment' })
    );
    expect(fs.unlinkSync).toHaveBeenCalledWith(tmpPath);
  });

  it('warns when temp cleanup fails for non-ENOENT errors', async () => {
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      const err = new Error('busy') as NodeJS.ErrnoException;
      err.code = 'EBUSY';
      throw err;
    });

    const req = {
      id: 'rid-2',
      userId: 1,
      file: {
        path: tmpPath,
        mimetype: 'text/plain',
        originalname: 'a.txt',
      },
    } as AuthRequest & { file: { path: string; mimetype: string; originalname: string } };

    await uploadChatAttachment(req, mockRes());

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/chat attachment temp cleanup failed.*busy/)
    );
  });

  it('does not warn on ENOENT cleanup', async () => {
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      const err = new Error('gone') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    const req = {
      id: 'rid-3',
      userId: 1,
      file: {
        path: tmpPath,
        mimetype: 'text/plain',
        originalname: 'a.txt',
      },
    } as AuthRequest & { file: { path: string; mimetype: string; originalname: string } };

    await uploadChatAttachment(req, mockRes());

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('decodes Latin-1 mojibake Ukrainian originalname to proper UTF-8', async () => {
    const mojibake = Buffer.from('Контекст.txt', 'utf8').toString('latin1');
    const req = {
      id: 'rid-4',
      userId: 1,
      file: {
        path: tmpPath,
        mimetype: 'text/plain',
        originalname: mojibake,
      },
    } as AuthRequest & { file: { path: string; mimetype: string; originalname: string } };
    const res = mockRes();

    await uploadChatAttachment(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'Контекст.txt', chars: 16 })
    );
  });
});
