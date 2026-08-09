import { describe, expect, it } from 'vitest';
import { shouldSelectDocumentOnUpload } from './useChatDocuments';

describe('shouldSelectDocumentOnUpload', () => {
  it('selects only ready documents', () => {
    expect(shouldSelectDocumentOnUpload('ready')).toBe(true);
    expect(shouldSelectDocumentOnUpload('pending')).toBe(false);
    expect(shouldSelectDocumentOnUpload('failed')).toBe(false);
    expect(shouldSelectDocumentOnUpload(undefined)).toBe(false);
  });
});
