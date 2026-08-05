import { parseListPagination } from '../utils/listPagination';

describe('parseListPagination', () => {
  it('uses defaults when query empty', () => {
    expect(parseListPagination({})).toEqual({ limit: 50, offset: 0 });
  });

  it('clamps limit to max and floors offset', () => {
    expect(
      parseListPagination({ limit: '999', offset: '-5' }, { maxLimit: 200 })
    ).toEqual({ limit: 200, offset: 0 });
  });

  it('accepts valid limit and offset', () => {
    expect(parseListPagination({ limit: '10', offset: '20' })).toEqual({
      limit: 10,
      offset: 20,
    });
  });
});
