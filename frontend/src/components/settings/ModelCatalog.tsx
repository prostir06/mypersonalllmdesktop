/**
 * Settings catalog table + create/edit form for user-owned LLM models.
 */
import React from 'react';
import { Button, Spinner } from 'react-bootstrap';
import ConfirmModal from '../ConfirmModal';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import ModelCatalogTable from './ModelCatalogTable';
import ModelCatalogForm from './ModelCatalogForm';

export default function ModelCatalog() {
  const {
    models,
    isLoading,
    busy,
    form,
    setForm,
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
  } = useModelCatalog();

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

      <ModelCatalogTable
        models={models}
        busy={busy}
        onEdit={startEdit}
        onDelete={handleDelete}
      />

      {showForm && (
        <ModelCatalogForm
          form={form}
          setForm={setForm}
          editingId={editingId}
          busy={busy}
          onSubmit={handleSubmit}
          onCancel={resetForm}
        />
      )}
      <ConfirmModal
        show={deleteTarget != null}
        title="Видалення моделі"
        message={`Видалити модель «${deleteTarget?.name}»?`}
        confirmLabel="Видалити"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
