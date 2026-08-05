/**
 * Settings catalog table + create/edit form for user-owned LLM models.
 */
import React, { useState } from 'react';
import { Button, Form, Spinner, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import {
  isSystemModel,
  useCreateModel,
  useDeleteModel,
  useModels,
  useUpdateModel,
} from '../../hooks/useModels';

const emptyForm = {
  name: '',
  modelId: '',
  provider: 'openai',
  description: '',
  temperature: 0.7,
  maxTokens: 2000,
};

export default function ModelCatalog() {
  const { data: models = [], isLoading } = useModels();
  const createMutation = useCreateModel();
  const updateMutation = useUpdateModel();
  const deleteMutation = useDeleteModel();

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

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

  const startEdit = (m) => {
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

  const handleSubmit = async (e) => {
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
    } catch (err) {
      toast.error(
        err?.response?.data?.error || 'Не вдалося зберегти модель'
      );
    }
  };

  const handleDelete = async (m) => {
    if (!window.confirm(`Видалити модель «${m.name}»?`)) return;
    try {
      await deleteMutation.mutateAsync(m.id);
      toast.info('Модель видалено');
      if (editingId === m.id) resetForm();
    } catch (err) {
      toast.error(
        err?.response?.data?.error || 'Не вдалося видалити модель'
      );
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-3">
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="small text-muted mb-0">
          Системні моделі лише для перегляду. Власні — можна редагувати.
        </p>
        <Button
          variant="outline-primary"
          size="sm"
          onClick={startCreate}
          disabled={busy}
        >
          Додати модель
        </Button>
      </div>

      <Table responsive size="sm" className="align-middle text-light mb-3">
        <thead>
          <tr className="text-muted small">
            <th>Назва</th>
            <th>model_id</th>
            <th>Провайдер</th>
            <th>Temp</th>
            <th>Max tokens</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {models.length === 0 && (
            <tr>
              <td colSpan={6} className="text-muted small">
                Каталог порожній — додайте першу модель.
              </td>
            </tr>
          )}
          {models.map((m) => {
            const system = isSystemModel(m);
            return (
              <tr key={m.id}>
                <td>
                  {m.name}
                  {system && (
                    <span className="badge text-bg-secondary ms-2">
                      системна
                    </span>
                  )}
                </td>
                <td>
                  <code className="small">{m.model_id}</code>
                </td>
                <td>{m.provider}</td>
                <td>{m.temperature ?? '—'}</td>
                <td>{m.max_tokens ?? '—'}</td>
                <td className="text-end text-nowrap">
                  {!system && (
                    <>
                      <Button
                        variant="link"
                        size="sm"
                        className="text-info p-0 me-2"
                        onClick={() => startEdit(m)}
                        aria-label={`Редагувати ${m.name}`}
                      >
                        Змінити
                      </Button>
                      <Button
                        variant="link"
                        size="sm"
                        className="text-danger p-0"
                        onClick={() => handleDelete(m)}
                        aria-label={`Видалити ${m.name}`}
                        disabled={busy}
                      >
                        Видалити
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      {showForm && (
        <Form onSubmit={handleSubmit} className="border border-secondary rounded p-3">
          <h6 className="small fw-semibold mb-3">
            {editingId != null ? 'Редагувати модель' : 'Нова модель'}
          </h6>
          <div className="row g-2">
            <div className="col-md-6">
              <Form.Label className="small">Назва</Form.Label>
              <Form.Control
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-dark text-light border-secondary"
                required
              />
            </div>
            <div className="col-md-6">
              <Form.Label className="small">model_id</Form.Label>
              <Form.Control
                value={form.modelId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, modelId: e.target.value }))
                }
                className="bg-dark text-light border-secondary"
                required
                disabled={editingId != null}
              />
            </div>
            <div className="col-md-4">
              <Form.Label className="small">Провайдер</Form.Label>
              <Form.Select
                value={form.provider}
                onChange={(e) =>
                  setForm((f) => ({ ...f, provider: e.target.value }))
                }
                className="bg-dark text-light border-secondary"
              >
                <option value="openai">openai</option>
                <option value="ollama">ollama</option>
              </Form.Select>
            </div>
            <div className="col-md-4">
              <Form.Label className="small">Температура</Form.Label>
              <Form.Control
                type="number"
                min={0}
                max={2}
                step={0.05}
                value={form.temperature}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    temperature: parseFloat(e.target.value) || 0,
                  }))
                }
                className="bg-dark text-light border-secondary"
              />
            </div>
            <div className="col-md-4">
              <Form.Label className="small">Max tokens</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={form.maxTokens}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxTokens: parseInt(e.target.value, 10) || 1,
                  }))
                }
                className="bg-dark text-light border-secondary"
              />
            </div>
            <div className="col-12">
              <Form.Label className="small">Опис</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className="bg-dark text-light border-secondary"
              />
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Spinner size="sm" animation="border" /> : 'Зберегти'}
            </Button>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              onClick={resetForm}
              disabled={busy}
            >
              Скасувати
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}
