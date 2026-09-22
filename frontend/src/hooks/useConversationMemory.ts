import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { conversationAPI } from '../services/api';
import type { ConversationMemory, ConversationMemoryNote } from '../types/api';
import { queryKeys } from './queryKeys';

const EMPTY_MEMORY: ConversationMemory = {
  summary: null,
  summary_updated_at: null,
  notes: [],
};

function readApiError(error: unknown, fallback: string): string {
  const ax = error as AxiosError<{ error?: string; errors?: Array<{ msg?: string }> }>;
  return (
    ax?.response?.data?.error ||
    ax?.response?.data?.errors?.[0]?.msg ||
    ax?.message ||
    fallback
  );
}

export function useConversationMemory(
  conversationId?: string | number | null,
  opts: { enabled?: boolean } = {}
) {
  const enabled = opts.enabled ?? true;
  const queryClient = useQueryClient();
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const query = useQuery({
    queryKey:
      conversationId != null
        ? queryKeys.conversationMemory(conversationId)
        : (['conversation-memory', 'none'] as const),
    queryFn: async () => {
      const res = await conversationAPI.getMemory(conversationId!);
      return res.data;
    },
    enabled: conversationId != null && enabled,
  });

  const memory = query.data ?? EMPTY_MEMORY;

  const setMemoryCache = useCallback(
    (updater: (prev: ConversationMemory) => ConversationMemory) => {
      if (conversationId == null) return;
      queryClient.setQueryData<ConversationMemory>(
        queryKeys.conversationMemory(conversationId),
        (prev) => updater(prev ?? EMPTY_MEMORY)
      );
    },
    [conversationId, queryClient]
  );

  const loadMemory = useCallback(async () => {
    if (conversationId == null || !enabled) return;
    await query.refetch();
  }, [conversationId, enabled, query]);

  const createNote = useCallback(
    async (content: string) => {
      if (conversationId == null) return null;
      setMutating(true);
      setMutationError(null);
      try {
        const res = await conversationAPI.createMemoryNote(conversationId, content);
        setMemoryCache((prev) => ({
          ...prev,
          notes: [...prev.notes, res.data],
        }));
        return res.data;
      } catch (e: unknown) {
        setMutationError(readApiError(e, 'Не вдалося створити нотатку'));
        return null;
      } finally {
        setMutating(false);
      }
    },
    [conversationId, setMemoryCache]
  );

  const updateNote = useCallback(
    async (noteId: string | number, content: string) => {
      if (conversationId == null) return null;
      setMutating(true);
      setMutationError(null);
      try {
        const res = await conversationAPI.updateMemoryNote(
          conversationId,
          noteId,
          content
        );
        setMemoryCache((prev) => ({
          ...prev,
          notes: prev.notes.map((note) =>
            note.id === noteId ? res.data : note
          ),
        }));
        return res.data;
      } catch (e: unknown) {
        setMutationError(readApiError(e, 'Не вдалося оновити нотатку'));
        return null;
      } finally {
        setMutating(false);
      }
    },
    [conversationId, setMemoryCache]
  );

  const deleteNote = useCallback(
    async (noteId: string | number) => {
      if (conversationId == null) return false;
      setMutating(true);
      setMutationError(null);
      try {
        await conversationAPI.deleteMemoryNote(conversationId, noteId);
        setMemoryCache((prev) => ({
          ...prev,
          notes: prev.notes.filter((note) => note.id !== noteId),
        }));
        return true;
      } catch (e: unknown) {
        setMutationError(readApiError(e, 'Не вдалося видалити нотатку'));
        return false;
      } finally {
        setMutating(false);
      }
    },
    [conversationId, setMemoryCache]
  );

  const refreshSummary = useCallback(async () => {
    if (conversationId == null) return false;
    setMutating(true);
    setMutationError(null);
    try {
      await conversationAPI.refreshSummary(conversationId);
      await query.refetch();
      return true;
    } catch (e: unknown) {
      setMutationError(readApiError(e, 'Не вдалося оновити підсумок'));
      return false;
    } finally {
      setMutating(false);
    }
  }, [conversationId, query]);

  const queryError =
    query.error != null
      ? readApiError(query.error, 'Не вдалося завантажити памʼять розмови')
      : null;

  return {
    summary: memory.summary,
    summaryUpdatedAt: memory.summary_updated_at,
    notes: memory.notes,
    loading: query.isFetching,
    mutating,
    error: mutationError ?? queryError,
    loadMemory,
    createNote,
    updateNote,
    deleteNote,
    refreshSummary,
  };
}

export type ConversationMemoryHook = ReturnType<typeof useConversationMemory>;
export type ConversationMemoryNoteItem = ConversationMemoryNote;
