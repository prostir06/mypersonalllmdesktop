import { describe, it, expect } from 'vitest';
import { nextListOffset } from './listPagination';

describe('nextListOffset', () => {
  it('returns next offset while items remain', () => {
    expect(
      nextListOffset({ items: [{ id: 1 }, { id: 2 }], total: 5, offset: 0 })
    ).toBe(2);
    expect(
      nextListOffset({ items: [{ id: 3 }], total: 5, offset: 2 })
    ).toBe(3);
  });

  it('returns undefined when page is complete or invalid', () => {
    expect(
      nextListOffset({ items: [{ id: 1 }], total: 1, offset: 0 })
    ).toBeUndefined();
    expect(nextListOffset({ items: [], total: 0, offset: 0 })).toBeUndefined();
    expect(nextListOffset(null)).toBeUndefined();
  });
});
