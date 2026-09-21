import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import {
  useCreateModel,
  useDeleteModel,
  useModels,
  useUpdateModel,
} from './useModels';
import type { ModelRecord } from '../types/api';

export type CatalogForm = {
  name: string;
  modelId: string;
  provider: string;
  description: string;
  temperature: number;
  maxTokens: number;
};

const emptyForm: CatalogForm = {
  name: '',
  modelId: '',
  provider: 'openai',
  description: '',
  temperature: 0.7,
  maxTokens: 2000,
};

export function useModelCatalog() {
  const { data: models = [], isLoading } = useModels();
  const createMutation = useCreateModel();
  const updateMutation = useUpdateModel();
  const deleteMutation = useDeleteModel();

  const [form, setForm] = useState<CatalogForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ModelRecord | null>(null);

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (m: ModelRecord) => {
    setEditingId(m.id);
    setForm({
      name: m.name || '',
      modelId: m.model_id || '',
      provider: m.provider || 'openai',
      description: m.description || '',
      temperature: Number(m.temperature) || 0.7,
      maxTokens: Number(m.max_tokens) || 2000,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.modelId.trim()) {
      toast.error('Назва та model_id обовʼязкові');
      return;
    }

    try {
      if (editingId != null) {
        await updateMutation.mutateAsync({
          id: editingId,
          payload: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            temperature: form.temperature,
            maxTokens: form.maxTokens,
            provider: form.provider,
          },
        });
        toast.success('Модель оновлено');
      } else {
        await createMutation.mutateAsync({
          name: form.name.trim(),
          modelId: form.modelId.trim(),
          description: form.description.trim() || undefined,
          temperature: form.temperature,
          maxTokens: form.maxTokens,
          provider: form.provider,
        });
        toast.success('Модель додано');
      }
      resetForm();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Не вдалося зберегти модель');
    }
  };

  const handleDelete = (m: ModelRecord) => {
    setDeleteTarget(m);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.info('Модель видалено');
      if (editingId === deleteTarget.id) resetForm();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Не вдалося видалити модель');
    } finally {
      setDeleteTarget(null);
    }
  };

  return {
    models,
    isLoading,
    busy,
    form,
    setForm: setForm as Dispatch<SetStateAction<CatalogForm>>,
    showForm,
    editingId,
    startCreate,
    startEdit,
    resetForm,
    handleSubmit,
    deleteTarget,
    handleDelete,
    confirmDelete,
    setDeleteTarget,
  };
}
