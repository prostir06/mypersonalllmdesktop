import { runShutdown } from '../shutdown';

describe('runShutdown', () => {
  it('closes the server before disconnecting prisma', async () => {
    const order: string[] = [];
    await runShutdown({
      close: async () => {
        order.push('close');
      },
      disconnect: async () => {
        order.push('disconnect');
      },
      timeoutMs: 1000,
    });
    expect(order).toEqual(['close', 'disconnect']);
  });

  it('rejects when close does not finish before the timeout', async () => {
    await expect(
      runShutdown({
        close: () => new Promise(() => undefined),
        disconnect: async () => undefined,
        timeoutMs: 20,
      })
    ).rejects.toThrow('shutdown timeout');
  });
});
