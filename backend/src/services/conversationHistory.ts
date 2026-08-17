/** Linear conversation view with assistant branch selection. */
import type { RagSource } from './chat/types';

export type RawMessage = {
  id: number;
  role: string;
  content: string;
  parentId: number | null;
  createdAt: Date;
  sources?: RagSource[] | null;
};

export type BranchInfo = {
  id: number;
  content: string;
  created_at: Date;
  sources?: RagSource[];
};

export type LinearMessage = {
  id: number;
  role: string;
  content: string;
  createdAt: Date;
  parentId?: number | null;
  branches?: BranchInfo[];
  branchIndex?: number;
  sources?: RagSource[];
};

export function asRagSources(value: unknown): RagSource[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value as RagSource[];
}

function indexAssistantBranches(all: RawMessage[]): Map<number, RawMessage[]> {
  const byParent = new Map<number, RawMessage[]>();
  for (const m of all) {
    if (m.role !== 'assistant' || m.parentId == null) continue;
    const list = byParent.get(m.parentId) || [];
    list.push(m);
    byParent.set(m.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return byParent;
}

function pickBranch(
  branches: RawMessage[],
  activeBranchIds?: Record<number, number>
): { msg: RawMessage; index: number } {
  const userId = branches[0]?.parentId;
  if (userId != null && activeBranchIds?.[userId] != null) {
    const idx = branches.findIndex((b) => b.id === activeBranchIds[userId]);
    if (idx >= 0) return { msg: branches[idx], index: idx };
  }
  const last = branches.length - 1;
  return { msg: branches[last], index: last };
}

/** Collapse DB rows into one assistant per user turn (latest branch by default). */
export function buildLinearHistory(
  all: RawMessage[],
  activeBranchIds?: Record<number, number>
): LinearMessage[] {
  const assistantsByParent = indexAssistantBranches(all);
  const usedAssistantIds = new Set<number>();
  const out: LinearMessage[] = [];

  for (let i = 0; i < all.length; i++) {
    const m = all[i];
    if (m.role !== 'user') continue;

    out.push({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    });

    const branches = assistantsByParent.get(m.id);
    if (branches?.length) {
      const { msg: chosen, index } = pickBranch(branches, activeBranchIds);
      usedAssistantIds.add(chosen.id);
      const branchPayload: BranchInfo[] = branches.map((b) => ({
        id: b.id,
        content: b.content,
        created_at: b.createdAt,
        sources: asRagSources(b.sources),
      }));
      out.push({
        id: chosen.id,
        role: 'assistant',
        content: chosen.content,
        createdAt: chosen.createdAt,
        parentId: m.id,
        sources: asRagSources(chosen.sources),
        branches: branchPayload.length > 1 ? branchPayload : undefined,
        branchIndex: branchPayload.length > 1 ? index : undefined,
      });
      continue;
    }

    const next = all[i + 1];
    if (next?.role === 'assistant' && next.parentId == null) {
      usedAssistantIds.add(next.id);
      out.push({
        id: next.id,
        role: next.role,
        content: next.content,
        createdAt: next.createdAt,
        parentId: m.id,
        sources: asRagSources(next.sources),
      });
    }
  }

  for (const m of all) {
    if (
      m.role === 'assistant' &&
      m.parentId == null &&
      !usedAssistantIds.has(m.id)
    ) {
      out.push({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        parentId: m.parentId,
        sources: asRagSources(m.sources),
      });
    }
  }

  out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return out;
}

/** Provider prompt: role + content only, capped at newest N linear turns. */
export function toProviderMessages(
  linear: LinearMessage[],
  take = 50
): Array<{ role: string; content: string }> {
  const slice = linear.slice(-take);
  return slice.map(({ role, content }) => ({ role, content }));
}

/** History up to and including a user message (for regenerate). */
export function linearHistoryUpTo(
  all: RawMessage[],
  upToUserMessageId: number,
  activeBranchIds?: Record<number, number>
): LinearMessage[] {
  const linear = buildLinearHistory(all, activeBranchIds);
  const cutoffIdx = linear.findIndex(
    (m) => m.role === 'user' && m.id === upToUserMessageId
  );
  if (cutoffIdx < 0) return linear;
  return linear.slice(0, cutoffIdx + 1);
}
