import { buildMessageFtsQuery } from '../utils/messageFts';

describe('buildMessageFtsQuery', () => {
  it('builds SQL that uses to_tsvector / plainto_tsquery', () => {
    const sql = buildMessageFtsQuery(7, 'hello world', null);
    expect(Array.isArray(sql.strings)).toBe(true);
    const text = sql.strings.join('?');
    expect(text).toMatch(/to_tsvector\('simple'/);
    expect(text).toMatch(/plainto_tsquery\('simple'/);
    expect(text).toMatch(/c\.user_id/);
    expect(text).not.toMatch(/m\.conversation_id =/);
  });

  it('includes conversation_id filter when provided', () => {
    const sql = buildMessageFtsQuery(1, 'ab', 12);
    const text = sql.strings.join('?');
    expect(text).toMatch(/m\.conversation_id =/);
  });
});
