import { sanitizeDocumentIds, conversationTitle } from '../services/chat/ownership';

describe('chat ownership helpers', () => {
  it('sanitizeDocumentIds keeps positive ints only', () => {
    expect(sanitizeDocumentIds([1, -2, 3.5, '4', 'x'])).toEqual([1, 4]);
  });

  it('conversationTitle truncates at 50', () => {
    const long = 'a'.repeat(60);
    expect(conversationTitle(long).endsWith('...')).toBe(true);
    expect(conversationTitle(long).length).toBe(53);
  });
});
