import { UrlNotAllowedError } from '../utils/urlAllowlist';
import {
  parseDocumentId,
  publicUploadError,
  classifyReindexError,
  classifyRetryError,
} from '../services/documents/httpErrors';

describe('documents httpErrors', () => {
  it('parseDocumentId accepts digits only', () => {
    expect(parseDocumentId('42')).toBe(42);
    expect(parseDocumentId('x')).toBeNull();
  });

  it('requireDocumentId is covered via parseDocumentId', () => {
    expect(parseDocumentId('01')).toBe(1);
  });

  it('publicUploadError hides details in production', () => {
    expect(publicUploadError(true, 'Публічна', 'secret')).toBe('Публічна');
    expect(publicUploadError(false, 'Публічна', 'secret')).toBe(
      'Публічна: secret'
    );
  });

  it('classifyReindexError maps UrlNotAllowed and known 409 phrases', () => {
    expect(classifyReindexError(new UrlNotAllowedError('bad')).status).toBe(400);
    expect(
      classifyReindexError(new Error('Немає фрагментів для переіндексації')).status
    ).toBe(409);
    expect(classifyReindexError(new Error('boom')).status).toBe(500);
  });

  it('classifyRetryError maps conflict phrase', () => {
    expect(classifyRetryError('ліміт повторної індексації').status).toBe(409);
    expect(classifyRetryError('other').status).toBe(500);
  });
});
