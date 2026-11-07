export type DocumentStatusUpdate = {
  id: string | number;
  status?: string;
  filename?: string;
  failure_reason?: string;
  has_embeddings?: boolean;
};

export function pendingDocumentIds(
  docs: Array<{ id: string | number; status?: string | null }>
): Array<string | number> {
  return docs.filter((doc) => doc.status === 'pending').map((doc) => doc.id);
}

export function applyDocumentStatuses<
  T extends {
    id: string | number;
    status?: string;
    filename?: string;
    failure_reason?: string;
    has_embeddings?: boolean;
  },
>(docs: T[], updates: DocumentStatusUpdate[]): { items: T[]; changed: boolean } {
  const byId = new Map(updates.map((update) => [String(update.id), update]));
  let changed = false;
  const items = docs.map((doc) => {
    const update = byId.get(String(doc.id));
    if (!update) return doc;
    const status = update.status ?? doc.status;
    const failure_reason = update.failure_reason ?? doc.failure_reason;
    const has_embeddings = update.has_embeddings ?? doc.has_embeddings;
    if (
      status === doc.status &&
      failure_reason === doc.failure_reason &&
      has_embeddings === doc.has_embeddings
    ) {
      return doc;
    }
    changed = true;
    return {
      ...doc,
      status,
      filename: update.filename ?? doc.filename,
      failure_reason,
      has_embeddings,
    };
  });
  return { items, changed };
}
