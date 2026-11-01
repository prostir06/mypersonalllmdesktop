import React, { useState } from 'react';
import { Button, Badge, Spinner, Table } from 'react-bootstrap';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatAPI } from '../../services/api';
import { queryKeys } from '../../hooks/queryKeys';
import type { ToolTraceEntry } from '../../types/api';

export interface ConfirmActionCardProps {
  toolTrace?: ToolTraceEntry;
  entry?: ToolTraceEntry;
  actionId?: string;
  conversationId?: string | number;
  onResolved?: (status: 'approved' | 'rejected') => void;
}

export const ConfirmActionCard: React.FC<ConfirmActionCardProps> = ({
  toolTrace,
  entry,
  actionId,
  conversationId,
  onResolved,
}) => {
  const item = toolTrace || entry;
  const targetActionId = actionId || item?.pendingActionId;
  const queryClient = useQueryClient();

  // Initial resolved state based on item status
  const initialResolved =
    item?.status === 'completed'
      ? 'approved'
      : item?.status === 'rejected'
        ? 'rejected'
        : null;

  const [resolvedStatus, setResolvedStatus] = useState<'approved' | 'rejected' | null>(
    initialResolved
  );

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!targetActionId) throw new Error('No action ID provided');
      return chatAPI.approveToolAction(targetActionId);
    },
    onSuccess: () => {
      setResolvedStatus('approved');
      onResolved?.('approved');
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userMemoryNotes });
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemKnowledgeAll });
      if (conversationId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.history(conversationId),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversationMemory(conversationId),
        });
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!targetActionId) throw new Error('No action ID provided');
      return chatAPI.rejectToolAction(targetActionId);
    },
    onSuccess: () => {
      setResolvedStatus('rejected');
      onResolved?.('rejected');
    },
  });

  if (!item && !targetActionId) return null;

  const title = item?.title || 'Підтвердження дії';
  const summary = item?.summary || (item?.tool ? `Запит на виконання: ${item.tool}` : '');
  const diff = item?.diff;
  const isPending = approveMutation.isPending || rejectMutation.isPending;

  if (resolvedStatus === 'approved') {
    return (
      <div className="card mb-2 border-success bg-success bg-opacity-10 text-light p-2">
        <div className="d-flex align-items-center gap-2">
          <span>✅</span>
          <span className="fw-semibold">Дію підтверджено</span>
          {summary && <span className="text-muted small">({summary})</span>}
        </div>
      </div>
    );
  }

  if (resolvedStatus === 'rejected') {
    return (
      <div className="card mb-2 border-secondary bg-secondary bg-opacity-10 text-muted p-2">
        <div className="d-flex align-items-center gap-2">
          <span>❌</span>
          <span className="fw-semibold">Дію відхилено</span>
          {summary && <span className="small">({summary})</span>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="card mb-2 border-warning bg-dark bg-opacity-50 text-light"
      style={{ borderRadius: '6px', fontSize: '0.88rem' }}
    >
      <div className="card-header py-2 px-3 border-secondary d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <span>⚠️</span>
          <span className="fw-bold text-warning">{title}</span>
        </div>
        <Badge bg="warning" text="dark">
          Очікує підтвердження
        </Badge>
      </div>

      <div className="card-body p-3">
        {summary && <p className="mb-2 text-light">{summary}</p>}

        {diff && Object.keys(diff).length > 0 && (
          <div className="mb-3">
            <span className="small text-muted d-block mb-1">Зміни:</span>
            <Table size="sm" bordered responsive variant="dark" className="mb-0" style={{ fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Параметр</th>
                  <th>Було</th>
                  <th>Стане</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(diff).map(([key, change]) => (
                  <tr key={key}>
                    <td className="fw-semibold text-info">{key}</td>
                    <td className="text-danger text-decoration-line-through">
                      {typeof change.from === 'object' ? JSON.stringify(change.from) : String(change.from ?? '—')}
                    </td>
                    <td className="text-success fw-bold">
                      {typeof change.to === 'object' ? JSON.stringify(change.to) : String(change.to ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        {(approveMutation.error || rejectMutation.error) && (
          <div className="alert alert-danger py-1 px-2 mb-2 small">
            {approveMutation.error instanceof Error
              ? approveMutation.error.message
              : rejectMutation.error instanceof Error
                ? rejectMutation.error.message
                : 'Помилка обробки дії'}
          </div>
        )}

        <div className="d-flex align-items-center gap-2 mt-2">
          <Button
            variant="success"
            size="sm"
            disabled={isPending || !targetActionId}
            onClick={() => approveMutation.mutate()}
            className="d-inline-flex align-items-center gap-1"
          >
            {approveMutation.isPending && <Spinner size="sm" animation="border" />}
            <span>Підтвердити</span>
          </Button>

          <Button
            variant="outline-danger"
            size="sm"
            disabled={isPending || !targetActionId}
            onClick={() => rejectMutation.mutate()}
            className="d-inline-flex align-items-center gap-1"
          >
            {rejectMutation.isPending && <Spinner size="sm" animation="border" />}
            <span>Відхилити</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmActionCard;
