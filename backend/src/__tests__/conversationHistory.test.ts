import {
  buildLinearHistory,
  linearHistoryUpTo,
  toProviderMessages,
  type RawMessage,
} from '../services/conversationHistory';

describe('conversationHistory', () => {
  const t0 = new Date('2026-08-01T10:00:00Z');
  const t1 = new Date('2026-08-01T10:01:00Z');
  const t2 = new Date('2026-08-01T10:02:00Z');

  it('buildLinearHistory picks latest assistant branch by default', () => {
    const all: RawMessage[] = [
      { id: 1, role: 'user', content: 'q', parentId: null, createdAt: t0 },
      { id: 2, role: 'assistant', content: 'a1', parentId: 1, createdAt: t1 },
      { id: 3, role: 'assistant', content: 'a2', parentId: 1, createdAt: t2 },
    ];
    const linear = buildLinearHistory(all);
    expect(linear).toHaveLength(2);
    expect(linear[1].content).toBe('a2');
    expect(linear[1].branches).toHaveLength(2);
    expect(linear[1].branchIndex).toBe(1);
  });

  it('buildLinearHistory respects activeBranchIds', () => {
    const all: RawMessage[] = [
      { id: 1, role: 'user', content: 'q', parentId: null, createdAt: t0 },
      { id: 2, role: 'assistant', content: 'a1', parentId: 1, createdAt: t1 },
      { id: 3, role: 'assistant', content: 'a2', parentId: 1, createdAt: t2 },
    ];
    const linear = buildLinearHistory(all, { 1: 2 });
    expect(linear[1].content).toBe('a1');
    expect(linear[1].branchIndex).toBe(0);
  });

  it('linearHistoryUpTo includes target user message only', () => {
    const all: RawMessage[] = [
      { id: 1, role: 'user', content: 'q1', parentId: null, createdAt: t0 },
      {
        id: 2,
        role: 'assistant',
        content: 'a1',
        parentId: 1,
        createdAt: t1,
      },
      { id: 3, role: 'user', content: 'q2', parentId: null, createdAt: t2 },
    ];
    const slice = linearHistoryUpTo(all, 3);
    expect(slice.map((m) => m.content)).toEqual(['q1', 'a1', 'q2']);
  });

  it('toProviderMessages strips metadata', () => {
    const linear = buildLinearHistory([
      { id: 1, role: 'user', content: 'q', parentId: null, createdAt: t0 },
    ]);
    expect(toProviderMessages(linear)).toEqual([{ role: 'user', content: 'q' }]);
  });
});
