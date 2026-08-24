import { nowMs, elapsedMs } from '../utils/perfTimer';

describe('perfTimer', () => {
  it('elapsedMs is non-negative after nowMs', async () => {
    const start = nowMs();
    await new Promise((r) => setTimeout(r, 5));
    expect(elapsedMs(start)).toBeGreaterThanOrEqual(0);
  });
});
