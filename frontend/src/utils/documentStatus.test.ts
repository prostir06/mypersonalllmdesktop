import { describe, expect, it } from 'vitest';
import { applyDocumentStatuses, pendingDocumentIds } from './documentStatus';

describe('document status polling', () => {
  it('collects only pending ids', () => {
    expect(
      pendingDocumentIds([
        { id: 1, status: 'pending' },
        { id: 2, status: 'ready' },
        { id: 3, status: 'failed' },
      ])
    ).toEqual([1]);
  });

  it('patches a document when its status changes and leaves the rest', () => {
    const docs = [
      { id: 1, status: 'pending', filename: 'a.txt', has_embeddings: false },
      { id: 2, status: 'ready', filename: 'b.txt', has_embeddings: true },
    ];
    const first = applyDocumentStatuses(docs, [
      { id: 1, status: 'pending', has_embeddings: false },
    ]);
    expect(first.changed).toBe(false);
    expect(first.items[0]).toBe(docs[0]);

    const next = applyDocumentStatuses(docs, [
      {
        id: 1,
        status: 'ready',
        filename: 'a.txt',
        failure_reason: undefined,
        has_embeddings: false,
      },
    ]);
    expect(next.changed).toBe(true);
    expect(next.items[0].status).toBe('ready');
    expect(next.items[1]).toBe(docs[1]);
  });
});
