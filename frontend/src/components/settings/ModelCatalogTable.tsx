import React from 'react';
import { Button, Table } from 'react-bootstrap';
import { isSystemModel } from '../../hooks/useModels';
import type { ModelRecord } from '../../types/api';

type Props = {
  models: ModelRecord[];
  busy: boolean;
  onEdit: (m: ModelRecord) => void;
  onDelete: (m: ModelRecord) => void;
};

export default function ModelCatalogTable({
  models,
  busy,
  onEdit,
  onDelete,
}: Props) {
  return (
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
                  <span className="badge text-bg-secondary ms-2">системна</span>
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
                      onClick={() => onEdit(m)}
                      aria-label={`Редагувати ${m.name}`}
                    >
                      Змінити
                    </Button>
                    <Button
                      variant="link"
                      size="sm"
                      className="text-danger p-0"
                      onClick={() => onDelete(m)}
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
  );
}
