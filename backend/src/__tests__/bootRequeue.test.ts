jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    document: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../utils/documentJobQueue', () => ({
  enqueueDocumentJob: jest.fn((job: () => void) => {
    void job();
  }),
}));

jest.mock('../services/DocumentService', () => ({
  __esModule: true,
  default: {
    finalizeUpload: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/documents/indexingWatchdog', () => ({
  failStalePendingDocuments: jest.fn().mockResolvedValue(1),
  getIndexingStaleMs: jest.fn().mockReturnValue(600_000),
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

import fs from 'fs';
import prisma from '../config/prisma';
import DocumentService from '../services/DocumentService';
import { enqueueDocumentJob } from '../utils/documentJobQueue';
import { requeueOrFailStaleOnBoot } from '../services/documents/bootRequeue';

const mockedPrisma = prisma as unknown as {
  document: {
    findMany: jest.Mock;
    update: jest.Mock;
  };
};

describe('requeueOrFailStaleOnBoot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.document.update.mockResolvedValue({});
  });

  it('requeues pending with staging file and fails missing staging', async () => {
    mockedPrisma.document.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 9,
        filename: 'a.txt',
        fileType: 'text/plain',
        fileSize: 10,
        stagingPath: '/tmp/a.txt',
      },
      {
        id: 2,
        userId: 9,
        filename: 'b.txt',
        fileType: 'text/plain',
        fileSize: 10,
        stagingPath: '/tmp/missing.txt',
      },
    ]);
    (fs.existsSync as jest.Mock)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const result = await requeueOrFailStaleOnBoot(1_700_000_000_000);

    expect(result).toEqual({ requeued: 1, failed: 1, staleFailed: 1 });
    expect(enqueueDocumentJob).toHaveBeenCalledTimes(1);
    expect(DocumentService.finalizeUpload).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({ originalname: 'a.txt' }),
      '/tmp/a.txt'
    );
    expect(mockedPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({ status: 'failed' }),
      })
    );
  });
});
