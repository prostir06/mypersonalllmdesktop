/**
 * RAG documents list / upload / selection for chat.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import type { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import { documentsAPI } from '../services/api';
import type { DocumentRecord } from '../types/api';

export function useChatDocuments() {
  const [userDocuments, setUserDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Array<string | number>>(
    []
  );
  const [showDocModal, setShowDocModal] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await documentsAPI.getAll();
      setUserDocuments(res.data || []);
    } catch {
      // keep previous list
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleFileUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      setUploadingDoc(true);
      try {
        const res = await documentsAPI.upload(formData);
        toast.success(
          `📄 Файл "${file.name}" опрацьовано! Створено ${res.data.chunksCount} чанків.`
        );
        await loadDocuments();
        if (res.data.document?.id) {
          setSelectedDocIds((prev) => [...prev, res.data.document.id]);
        }
      } catch (err: unknown) {
        const ax = err as AxiosError<{ error?: string }>;
        const msg = ax.response?.data?.error || 'Помилка завантаження файлу';
        toast.error(msg);
      } finally {
        setUploadingDoc(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [loadDocuments]
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
      await documentsAPI.delete(docId);
      setSelectedDocIds((prev) => prev.filter((id) => id !== docId));
      await loadDocuments();
      toast.info('Файл видалено.');
    },
    [loadDocuments]
  );

  return {
    userDocuments,
    selectedDocIds,
    showDocModal,
    setShowDocModal,
    uploadingDoc,
    fileInputRef,
    handleFileUpload,
    handleToggleDoc,
    handleDeleteDoc,
  };
}
