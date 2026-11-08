import React from 'react';
import { Card, Row, Col } from 'react-bootstrap';
import type { UserSystemSnapshot } from '../../types/api';

interface SystemStatusSummaryProps {
  snapshot: UserSystemSnapshot;
}

export const SystemStatusSummary: React.FC<SystemStatusSummaryProps> = ({ snapshot }) => {
  return (
    <Card className="bg-dark border-secondary mb-4 shadow-sm">
      <Card.Body className="p-3">
        <div className="fw-semibold text-muted small mb-2 text-uppercase">
          Поточний статус системи
        </div>
        <Row className="g-2">
          <Col md={3} sm={6}>
            <div className="p-2 rounded bg-body-tertiary border border-secondary border-opacity-25 h-100 system-status-tile">
              <div className="status-label">Провайдер</div>
              <div
                className="status-value text-truncate"
                title={`${snapshot.activeProvider} (${snapshot.activeModel})`}
              >
                {snapshot.activeProvider} ({snapshot.activeModel})
              </div>
            </div>
          </Col>
          <Col md={3} sm={6}>
            <div className="p-2 rounded bg-body-tertiary border border-secondary border-opacity-25 h-100 system-status-tile">
              <div className="status-label">RAG База</div>
              <div
                className="status-value text-truncate"
                title={`${snapshot.ragEmbeddingMode} (${snapshot.documents.ready} готових, ${snapshot.documents.selectedInChat} обрано)`}
              >
                {snapshot.ragEmbeddingMode} ({snapshot.documents.ready} готових,{' '}
                {snapshot.documents.selectedInChat} обрано)
              </div>
            </div>
          </Col>
          <Col md={3} sm={6}>
            <div className="p-2 rounded bg-body-tertiary border border-secondary border-opacity-25 h-100 system-status-tile">
              <div className="status-label">Можливості</div>
              <div
                className="status-value text-truncate"
                title={`Vision (${snapshot.modelSupportsVision ? '✅' : '❌'}), Пошук (${snapshot.modelSupportsWebSearch ? (snapshot.webSearchEnabled ? '🌐 Увімкнено' : 'Звичайний') : '—'})`}
              >
                Vision ({snapshot.modelSupportsVision ? '✅' : '❌'}), Пошук (
                {snapshot.modelSupportsWebSearch
                  ? snapshot.webSearchEnabled
                    ? '🌐 Увімкнено'
                    : 'Звичайний'
                  : '—'}
                )
              </div>
            </div>
          </Col>
          <Col md={3} sm={6}>
            <div className="p-2 rounded bg-body-tertiary border border-secondary border-opacity-25 h-100 system-status-tile">
              <div className="status-label">Пам'ять та Ролі</div>
              <div
                className="status-value text-truncate"
                title={`${snapshot.userMemoryNotesCount} глобальних фактів, ${snapshot.pinnedPromptsCount} закріплених ролей`}
              >
                {snapshot.userMemoryNotesCount} глобальних фактів,{' '}
                {snapshot.pinnedPromptsCount} закріплених ролей
              </div>
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default React.memo(SystemStatusSummary);
