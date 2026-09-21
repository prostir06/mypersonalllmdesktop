import { useCallback, useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { conversationAPI } from '../services/api';
import type { ConversationMemory, ConversationMemoryNote } from '../types/api';

function readApiError(error: unknown, fallback: string): string {
  const ax = error as AxiosError<{ error?: string; errors?: Array<{ msg?: string }> }>;
  return (
    ax?.response?.data?.error ||
    ax?.response?.data?.errors?.[0]?.msg ||
    ax?.message ||
    fallback
  );
}

export function useConversationMemory(conversationId?: string | number | null) {
  const [memory, setMemory] = useState<ConversationMemory>({
    summary: null,
    summary_updated_at: null,
    notes: [],
  });
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMemory = useCallback(async () => {
    if (conversationId == null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await conversationAPI.getMemory(conversationId);
      setMemory(res.data);
    } catch (e: unknown) {
      setError(readApiError(e, 'Не вдалося завантажити memory'));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (conversationId == null) return;
    void loadMemory();
  }, [conversationId, loadMemory]);

  const createNote = useCallback(
    async (content: string) => {
      if (conversationId == null) return null;
      setMutating(true);
      setError(null);
      try {
        const res = await conversationAPI.createMemoryNote(conversationId, content);
        setMemory((prev) => ({ ...prev, notes: [...prev.notes, res.data] }));
        return res.data;
      } catch (e: unknown) {
        setError(readApiError(e, 'Не вдалося створити note'));
        return null;
      } finally {
        setMutating(false);
      }
    },
    [conversationId]
  );

  const updateNote = useCallback(
    async (noteId: string | number, content: string) => {
      if (conversationId == null) return null;
      setMutating(true);
      setError(null);
      try {
        const res = await conversationAPI.updateMemoryNote(conversationId, noteId, content);
        setMemory((prev) => ({
          ...prev,
          notes: prev.notes.map((note) => (note.id === noteId ? res.data : note)),
        }));
        return res.data;
      } catch (e: unknown) {
        setError(readApiError(e, 'Не вдалося оновити note'));
        return null;
      } finally {
        setMutating(false);
      }
    },
    [conversationId]
  );

  const deleteNote = useCallback(
    async (noteId: string | number) => {
      if (conversationId == null) return false;
      setMutating(true);
      setError(null);
      try {
        await conversationAPI.deleteMemoryNote(conversationId, noteId);
        setMemory((prev) => ({
          ...prev,
          notes: prev.notes.filter((note) => note.id !== noteId),
        }));
        return true;
      } catch (e: unknown) {
        setError(readApiError(e, 'Не вдалося видалити note'));
        return false;
      } finally {
        setMutating(false);
      }
    },
    [conversationId]
  );

  const refreshSummary = useCallback(async () => {
    if (conversationId == null) return false;
    setMutating(true);
    setError(null);
    try {
      await conversationAPI.refreshSummary(conversationId);
      await loadMemory();
      return true;
    } catch (e: unknown) {
      setError(readApiError(e, 'Не вдалося оновити summary'));
      return false;
    } finally {
      setMutating(false);
    }
  }, [conversationId, loadMemory]);

  return {
    summary: memory.summary,
    summaryUpdatedAt: memory.summary_updated_at,
    notes: memory.notes,
    loading,
    mutating,
    error,
    loadMemory,
    createNote,
    updateNote,
    deleteNote,
    refreshSummary,
  };
}

export type ConversationMemoryHook = ReturnType<typeof useConversationMemory>;
export type ConversationMemoryNoteItem = ConversationMemoryNote;
