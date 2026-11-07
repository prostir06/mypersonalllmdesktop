const execute = jest.fn(async () => ({ ok: true }));

const mockPrisma = {
  pendingToolAction: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  message: { findUnique: jest.fn(), update: jest.fn() },
};

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../services/tools/registry', () => ({
  __esModule: true,
  default: { get: () => ({ name: 'add_user_memory_note', execute }) },
}));

import { resolvePendingToolAction } from '../services/tools/actionResolver';

const pending = {
  id: 'act-1',
  userId: 1,
  conversationId: 5,
  messageId: 50,
  toolName: 'add_user_memory_note',
  toolArgs: { content: 'note' },
  status: 'pending',
  expiresAt: new Date(Date.now() + 60_000),
};

describe('resolvePendingToolAction claim', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.pendingToolAction.findUnique.mockResolvedValue(pending);
    mockPrisma.message.findUnique.mockResolvedValue({ id: 50, toolTrace: [] });
    mockPrisma.message.update.mockResolvedValue({});
    mockPrisma.pendingToolAction.update.mockResolvedValue({});
  });

  it('executes the tool only after a pending→executing claim', async () => {
    const order: string[] = [];
    mockPrisma.pendingToolAction.updateMany.mockImplementation(async () => {
      order.push('claim');
      return { count: 1 };
    });
    execute.mockImplementation(async () => {
      order.push('execute');
      return { ok: true };
    });

    await resolvePendingToolAction('act-1', 1, 'approve');

    expect(order).toEqual(['claim', 'execute']);
    expect(mockPrisma.pendingToolAction.updateMany).toHaveBeenCalledWith({
      where: { id: 'act-1', status: 'pending' },
      data: { status: 'executing' },
    });
  });

  it('does not execute when a concurrent claim already won', async () => {
    mockPrisma.pendingToolAction.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.pendingToolAction.findUnique
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, status: 'executing' });

    await expect(resolvePendingToolAction('act-1', 1, 'approve')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects with an atomic claim and never executes', async () => {
    mockPrisma.pendingToolAction.updateMany.mockResolvedValue({ count: 1 });

    const result = await resolvePendingToolAction('act-1', 1, 'reject');

    expect(result).toEqual({ success: true, status: 'rejected' });
    expect(execute).not.toHaveBeenCalled();
    expect(mockPrisma.pendingToolAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'act-1' },
        data: expect.objectContaining({ status: 'rejected' }),
      })
    );
  });
});
