import React, { useState } from 'react';
import { Badge, Button } from 'react-bootstrap';
import type { ToolTraceEntry } from '../../types/api';

export const TOOL_META: Record<string, { label: string; icon: string }> = {
  search_documents: { label: 'Пошук у документах', icon: '🔍' },
  web_search: { label: 'Веб-пошук', icon: '🌐' },
  calculate: { label: 'Обчислення', icon: '🧮' },
  get_current_time: { label: 'Поточний час', icon: '🕒' },
  read_memory: { label: "Перегляд пам'яті", icon: '🧠' },
  list_documents: { label: 'Список документів', icon: '📁' },
  get_system_help: { label: 'Довідка системи', icon: '❓' },
};

export interface ToolCallCardProps {
  toolTrace?: ToolTraceEntry;
  entry?: ToolTraceEntry;
  defaultExpanded?: boolean;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  toolTrace,
  entry,
  defaultExpanded = false,
}) => {
  const item = toolTrace || entry;
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  if (!item) return null;

  const toolName = item.tool || 'unknown_tool';
  const meta = TOOL_META[toolName] || {
    label: toolName,
    icon: '🔧',
  };

  const isFailed = item.status === 'failed' || Boolean(item.error);
  const statusBadge = isFailed ? (
    <Badge bg="danger" className="py-1 px-2">
      Помилка
    </Badge>
  ) : (
    <Badge bg="success" className="py-1 px-2">
      Виконано
    </Badge>
  );

  return (
    <div
      className="card mb-2 border-secondary bg-dark bg-opacity-25"
      style={{
        fontSize: '0.85rem',
        borderRadius: '6px',
      }}
    >
      <div className="card-body p-2 d-flex flex-column gap-1">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div className="d-flex align-items-center gap-2">
            <span style={{ fontSize: '1.1rem' }}>{meta.icon}</span>
            <span className="fw-semibold text-light">{meta.label}</span>
            {item.durationMs !== undefined && (
              <span className="text-muted small">
                ({item.durationMs} мс)
              </span>
            )}
          </div>
          <div className="d-flex align-items-center gap-2">
            {statusBadge}
            <Button
              variant="outline-secondary"
              size="sm"
              className="py-0 px-2"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
            >
              {isExpanded ? 'Згорнути ▲' : 'Деталі ▼'}
            </Button>
          </div>
        </div>

        {item.summary && !isExpanded && (
          <div className="text-muted small mt-1 text-truncate">
            {item.summary}
          </div>
        )}

        {isExpanded && (
          <div className="mt-2 pt-2 border-top border-secondary border-opacity-50">
            {item.args && Object.keys(item.args).length > 0 && (
              <div className="mb-2">
                <span className="text-muted small d-block mb-1">Аргументи:</span>
                <pre
                  className="p-2 rounded bg-black bg-opacity-50 text-light mb-0"
                  style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '0.78rem' }}
                >
                  {JSON.stringify(item.args, null, 2)}
                </pre>
              </div>
            )}

            {item.error ? (
              <div className="text-danger small">
                <strong>Помилка:</strong> {item.error}
              </div>
            ) : item.result !== undefined ? (
              <div>
                <span className="text-muted small d-block mb-1">Результат:</span>
                <pre
                  className="p-2 rounded bg-black bg-opacity-50 text-light mb-0"
                  style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.78rem' }}
                >
                  {typeof item.result === 'string'
                    ? item.result
                    : JSON.stringify(item.result, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolCallCard;
