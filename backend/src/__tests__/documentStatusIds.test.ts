import { parseDocumentStatusIds, MAX_DOCUMENT_STATUS_IDS } from '../services/documents/statusIds';

describe('parseDocumentStatusIds', () => {
  it('returns an empty list when nothing was asked', () => {
    expect(parseDocumentStatusIds(undefined)).toEqual([]);
    expect(parseDocumentStatusIds('')).toEqual([]);
    expect(parseDocumentStatusIds(' , ')).toEqual([]);
  });

  it('parses a comma list and drops duplicates', () => {
    expect(parseDocumentStatusIds('4,2,4')).toEqual([4, 2]);
    expect(parseDocumentStatusIds(['8', '9,9'])).toEqual([8, 9]);
  });

  it('rejects non-numeric ids and lists over the cap', () => {
    expect(parseDocumentStatusIds('1,abc')).toBeNull();
    expect(parseDocumentStatusIds('0,1')).toBeNull();
    const tooMany = Array.from({ length: MAX_DOCUMENT_STATUS_IDS + 1 }, (_, i) => String(i + 1)).join(',');
    expect(parseDocumentStatusIds(tooMany)).toBeNull();
  });
});
