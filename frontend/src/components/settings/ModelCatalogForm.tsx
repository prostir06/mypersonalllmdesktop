import React, { type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Button, Form, Spinner } from 'react-bootstrap';
import type { CatalogForm } from '../../hooks/useModelCatalog';

type Props = {
  form: CatalogForm;
  setForm: Dispatch<SetStateAction<CatalogForm>>;
  editingId: string | number | null;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
};

export default function ModelCatalogForm({
  form,
  setForm,
  editingId,
  busy,
  onSubmit,
  onCancel,
}: Props) {
  return (
    <Form onSubmit={onSubmit} className="border border-secondary rounded p-3">
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
            <option value="anthropic">anthropic</option>
            <option value="gemini">gemini</option>
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
          onClick={onCancel}
          disabled={busy}
        >
          Скасувати
        </Button>
      </div>
    </Form>
  );
}
