/**
 * RAG documents list / upload / selection — paginated list in React Query.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import type { AxiosError } from 'axios';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { documentsAPI } from '../services/api';
import { queryKeys } from './queryKeys';
import { nextListOffset } from '../utils/listPagination';
import {
  applyDocumentStatuses,
  pendingDocumentIds,
} from '../utils/documentStatus';
import type { DocumentRecord, PaginatedList } from '../types/api';

const PAGE_SIZE = 50;

/** Auto-select after upload only when already ready (pending waits for poll). */
export function shouldSelectDocumentOnUpload(
  status?: string | null
): boolean {
  return status === 'ready';
}

export function useChatDocuments() {
  const queryClient = useQueryClient();
  const [selectedDocIds, setSelectedDocIds] = useState<Array<string | number>>(
    []
  );
  const [showDocModal, setShowDocModal] = useState(false);
  const [retryingDocId, setRetryingDocId] = useState<string | number | null>(
    null
  );
  const [reindexingDocId, setReindexingDocId] = useState<string | number | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusByIdRef = useRef<Map<string | number, string>>(new Map());

  const documentsQuery = useInfiniteQuery({
    queryKey: queryKeys.documents,
    queryFn: async ({ pageParam }) => {
      const res = await documentsAPI.getAll({
        limit: PAGE_SIZE,
        offset: pageParam,
      });
      return res.data;
    },
    initialPageParam: 0,
    getNextPageParam: (last) => nextListOffset(last),
    staleTime: 1000 * 60,
  });

  const userDocuments = useMemo(
    () => documentsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [documentsQuery.data]
  );
  const pendingIds = useMemo(
    () => pendingDocumentIds(userDocuments),
    [userDocuments]
  );

  const statusQuery = useQuery({
    queryKey: [...queryKeys.documentStatuses, pendingIds.join(',')],
    enabled: pendingIds.length > 0,
    refetchInterval: pendingIds.length > 0 ? 1500 : false,
    queryFn: async () => {
      const res = await documentsAPI.getStatuses(pendingIds);
      return res.data.items;
    },
  });

  useEffect(() => {
    const updates = statusQuery.data;
    if (!updates?.length) return;
    queryClient.setQueryData<InfiniteData<PaginatedList<DocumentRecord>>>(
      queryKeys.documents,
      (current) => {
        if (!current) return current;
        let changed = false;
        const pages = current.pages.map((page) => {
          const merged = applyDocumentStatuses(page.items, updates);
          if (!merged.changed) return page;
          changed = true;
          return { ...page, items: merged.items };
        });
        return changed ? { ...current, pages } : current;
      }
    );
  }, [queryClient, statusQuery.data, statusQuery.dataUpdatedAt]);

  useEffect(() => {
    for (const doc of userDocuments) {
      const status = String(doc.status || 'ready');
      const prev = statusByIdRef.current.get(doc.id);
      if (prev === 'pending' && status === 'ready') {
        toast.success(`Файл "${doc.filename || doc.id}" готовий до RAG`);
        if (doc.has_embeddings === false) {
          toast.warn(
            'Документ проіндексовано без embeddings — натисніть «Переіндексувати» або перезавантажте файл'
          );
        }
        setSelectedDocIds((ids) =>
          ids.includes(doc.id) ? ids : [...ids, doc.id]
        );
      } else if (prev === 'pending' && status === 'failed') {
        toast.error(
          doc.failure_reason ||
            `Індексація "${doc.filename || doc.id}" не вдалася. Спробуйте повторити або завантажте знову.`
        );
      }
      statusByIdRef.current.set(doc.id, status);
    }
  }, [userDocuments]);

  const invalidateDocs = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.documents });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.systemKnowledgeAll,
    });
  }, [queryClient]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await documentsAPI.upload(formData);
      return { fileName: file.name, ...res.data };
    },
    onSuccess: (data) => {
      toast.info(
        `📄 Файл "${data.fileName}" прийнято. Індексація виконується у фоні…`
      );
      invalidateDocs();
      // Select only when already ready; pending waits for poll toast above.
      if (
        data.document?.id &&
        shouldSelectDocumentOnUpload(data.document.status)
      ) {
        setSelectedDocIds((prev) => [...prev, data.document.id]);
      }
      if (data.document?.id) {
        statusByIdRef.current.set(
          data.document.id,
          String(data.document.status || 'pending')
        );
      }
    },
    onError: (err: unknown) => {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка завантаження файлу');
    },
    onSettled: () => {
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string | number) => {
      await documentsAPI.delete(docId);
      return docId;
    },
    onSuccess: (docId) => {
      setSelectedDocIds((prev) => prev.filter((id) => id !== docId));
      statusByIdRef.current.delete(docId);
      invalidateDocs();
      toast.info('Файл видалено.');
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (docId: string | number) => {
      setRetryingDocId(docId);
      const res = await documentsAPI.retry(docId);
      return { docId, ...res.data };
    },
    onSuccess: (data) => {
      toast.info('Повторну індексацію поставлено в чергу…');
      if (data.document?.id) {
        statusByIdRef.current.set(
          data.document.id,
          String(data.document.status || 'pending')
        );
      }
      invalidateDocs();
    },
    onError: (err: unknown) => {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Не вдалося повторити індексацію');
    },
    onSettled: () => {
      setRetryingDocId(null);
    },
  });

  const reindexMutation = useMutation({
    mutationFn: async (docId: string | number) => {
      setReindexingDocId(docId);
      const res = await documentsAPI.reindex(docId);
      return { docId, ...res.data };
    },
    onSuccess: (data) => {
      toast.success('Embeddings оновлено');
      invalidateDocs();
      if (data.document?.id) {
        statusByIdRef.current.set(
          data.document.id,
          String(data.document.status || 'ready')
        );
      }
    },
    onError: (err: unknown) => {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Не вдалося переіндексувати документ');
    },
    onSettled: () => {
      setReindexingDocId(null);
    },
  });

  const handleFileUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadMutation.mutateAsync(file);
    },
    [uploadMutation]
  );

  const handleToggleDoc = useCallback(
    (docId: string | number, checked: boolean) => {
      setSelectedDocIds((prev) =>
        checked ? [...prev, docId] : prev.filter((id) => id !== docId)
      );
    },
    []
  );

  const handleDeleteDoc = useCallback(
    async (docId: string | number) => {
      await deleteMutation.mutateAsync(docId);
    },
    [deleteMutation]
  );

  const handleRetryDoc = useCallback(
    async (docId: string | number) => {
      await retryMutation.mutateAsync(docId);
    },
    [retryMutation]
  );

  const handleReindexDoc = useCallback(
    async (docId: string | number) => {
      await reindexMutation.mutateAsync(docId);
    },
    [reindexMutation]
  );

  return {
    userDocuments,
    selectedDocIds,
    showDocModal,
    setShowDocModal,
    uploadingDoc: uploadMutation.isPending,
    retryingDocId,
    reindexingDocId,
    fileInputRef,
    handleFileUpload,
    handleToggleDoc,
    handleDeleteDoc,
    handleRetryDoc,
    handleReindexDoc,
    hasMoreDocuments: Boolean(documentsQuery.hasNextPage),
    loadMoreDocuments: () => documentsQuery.fetchNextPage(),
    loadingMoreDocuments: documentsQuery.isFetchingNextPage,
  };
}
