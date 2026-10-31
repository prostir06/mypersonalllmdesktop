import React, { useState, useMemo } from 'react';
import {
  Modal,
  Button,
  Tabs,
  Tab,
  Badge,
  Card,
  Form,
  Row,
  Col,
  Spinner,
} from 'react-bootstrap';
import type {
  SystemKnowledgeResponse,
  AdvisoryTip,
  KnowledgeCategory,
} from '../../types/api';
import SystemGuideErrorState from './SystemGuideErrorState';

export interface SystemGuideModalProps {
  show: boolean;
  onHide: () => void;
  knowledge?: SystemKnowledgeResponse;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onAction?: (tip: AdvisoryTip) => void;
  onAskPrompt?: (prompt: string) => void;
}

const CATEGORIES: Array<{ key: 'all' | KnowledgeCategory; label: string }> = [
  { key: 'all', label: 'Усі' },
  { key: 'providers', label: 'Провайдери' },
  { key: 'settings', label: 'Налаштування' },
  { key: 'rag', label: 'Документи (RAG)' },
  { key: 'memory', label: "Пам'ять" },
  { key: 'artifacts', label: 'Артефакти' },
  { key: 'chat_tools', label: 'Інструменти чату' },
  { key: 'desktop', label: 'Desktop' },
];

const CATEGORY_NAMES: Record<KnowledgeCategory, string> = {
  providers: 'Провайдери',
  settings: 'Налаштування',
  rag: 'Документи (RAG)',
  memory: "Пам'ять",
  artifacts: 'Артефакти',
  chat_tools: 'Інструменти чату',
  desktop: 'Desktop',
};

const SystemGuideModal: React.FC<SystemGuideModalProps> = ({
  show,
  onHide,
  knowledge,
  isLoading = false,
  isError = false,
  onRetry,
  onAction,
  onAskPrompt,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<
    'all' | KnowledgeCategory
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  const snapshot = knowledge?.snapshot;
  const advisories = knowledge?.advisories ?? [];

  const filteredCards = useMemo(() => {
    const cards = knowledge?.cards ?? [];
    const q = searchQuery.trim().toLowerCase();
    return cards.filter((card) => {
      if (selectedCategory !== 'all' && card.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;

      const titleMatch = card.title.toLowerCase().includes(q);
      const summaryMatch = card.summary.toLowerCase().includes(q);
      const whyMatch = card.whyUse.toLowerCase().includes(q);
      const howMatch = card.howToUse.toLowerCase().includes(q);
      const keywordsMatch = card.keywords?.some((k) =>
        k.toLowerCase().includes(q)
      );

      return (
        titleMatch ||
        summaryMatch ||
        whyMatch ||
        howMatch ||
        Boolean(keywordsMatch)
      );
    });
  }, [knowledge?.cards, selectedCategory, searchQuery]);

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      centered
      className="glass-modal"
    >
      <Modal.Header
        closeButton
        className="border-secondary bg-dark text-light"
      >
        <Modal.Title className="fw-bold fs-5 d-flex align-items-center gap-2">
          <span>🧭</span> Гід по системі та AI-асистент
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="bg-dark text-light p-4">
        {isLoading ? (
          <div
            className="d-flex flex-column align-items-center justify-content-center p-5 text-muted"
            role="status"
          >
            <Spinner animation="border" variant="primary" className="mb-3" />
            <span>Завантаження знань про систему...</span>
          </div>
        ) : isError && !knowledge ? (
          <SystemGuideErrorState onRetry={onRetry} />
        ) : (
          <Tabs
            defaultActiveKey="advisories"
            id="system-guide-tabs"
            className="mb-3 border-secondary"
          >
            <Tab
              eventKey="advisories"
              title={
                <span>
                  💡 Персональні поради{' '}
                  {advisories.length > 0 && (
                    <Badge
                      bg={
                        advisories.some((a) => a.severity === 'warning')
                          ? 'warning'
                          : 'info'
                      }
                      text="dark"
                      className="ms-1"
                    >
                      {advisories.length}
                    </Badge>
                  )}
                </span>
              }
            >
              {snapshot && (
                <Card className="bg-dark border-secondary mb-4 shadow-sm">
                  <Card.Body className="p-3">
                    <div className="fw-semibold text-muted small mb-2 text-uppercase">
                      Поточний статус системи
                    </div>
                    <Row className="g-2">
                      <Col md={3} sm={6}>
                        <div className="p-2 rounded bg-body-tertiary border border-secondary border-opacity-25 h-100">
                          <div className="text-muted small">Провайдер</div>
                          <div className="fw-bold text-truncate">
                            {snapshot.activeProvider} ({snapshot.activeModel})
                          </div>
                        </div>
                      </Col>
                      <Col md={3} sm={6}>
                        <div className="p-2 rounded bg-body-tertiary border border-secondary border-opacity-25 h-100">
                          <div className="text-muted small">RAG База</div>
                          <div className="fw-bold text-truncate">
                            {snapshot.ragEmbeddingMode} (
                            {snapshot.documents.ready} готових,{' '}
                            {snapshot.documents.selectedInChat} обрано)
                          </div>
                        </div>
                      </Col>
                      <Col md={3} sm={6}>
                        <div className="p-2 rounded bg-body-tertiary border border-secondary border-opacity-25 h-100">
                          <div className="text-muted small">Можливості</div>
                          <div className="fw-bold text-truncate">
                            Vision (
                            {snapshot.modelSupportsVision ? '✅' : '❌'}),
                            Пошук (
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
                        <div className="p-2 rounded bg-body-tertiary border border-secondary border-opacity-25 h-100">
                          <div className="text-muted small">Пам'ять та Ролі</div>
                          <div className="fw-bold text-truncate">
                            {snapshot.userMemoryNotesCount} глобальних фактів,{' '}
                            {snapshot.pinnedPromptsCount} закріплених ролей
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              )}

              {advisories.length === 0 ? (
                <Card className="bg-success bg-opacity-10 border-success text-light text-center p-4">
                  <Card.Body>
                    <div className="fs-1 mb-2">🎉</div>
                    <h5 className="fw-bold">
                      Усе оптимально налаштовано! Жодних проблем не виявлено.
                    </h5>
                    <p className="text-muted mb-0 small">
                      Система готова до продуктивної роботи. Всі модулі та
                      налаштування відповідають поточному контексту.
                    </p>
                  </Card.Body>
                </Card>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {advisories.map((tip) => (
                    <Card
                      key={tip.id}
                      className={`border ${
                        tip.severity === 'warning'
                          ? 'border-warning bg-warning bg-opacity-10'
                          : 'border-info bg-info bg-opacity-10'
                      }`}
                    >
                      <Card.Body className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3">
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <Badge
                              bg={
                                tip.severity === 'warning' ? 'warning' : 'info'
                              }
                              text="dark"
                            >
                              {tip.severity === 'warning'
                                ? 'Попередження'
                                : 'Підказка'}
                            </Badge>
                            <span className="fw-bold">{tip.title}</span>
                          </div>
                          <div className="small text-light text-opacity-75">
                            {tip.message}
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-2 flex-shrink-0">
                          {tip.suggestedPrompt && (
                            <Button
                              size="sm"
                              variant="outline-light"
                              onClick={() => {
                                onAskPrompt?.(tip.suggestedPrompt!);
                                onHide();
                              }}
                            >
                              Запитати AI
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={
                              tip.severity === 'warning' ? 'warning' : 'info'
                            }
                            onClick={() => {
                              onAction?.(tip);
                              onHide();
                            }}
                          >
                            {tip.actionLabel}
                          </Button>
                        </div>
                      </Card.Body>
                    </Card>
                  ))}
                </div>
              )}
            </Tab>

            <Tab eventKey="catalog" title="📚 Функції та Налаштування">
              <div className="mb-3">
                <Form.Control
                  type="search"
                  placeholder="Пошук функцій за назвою, описом або ключовим словом..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-dark text-light border-secondary mb-3"
                />

                <div className="d-flex flex-wrap gap-2 mb-4">
                  {CATEGORIES.map((cat) => (
                    <Button
                      key={cat.key}
                      size="sm"
                      variant={
                        selectedCategory === cat.key
                          ? 'primary'
                          : 'outline-secondary'
                      }
                      onClick={() => setSelectedCategory(cat.key)}
                    >
                      {cat.label}
                    </Button>
                  ))}
                </div>

                {filteredCards.length === 0 ? (
                  <div className="text-center text-muted p-5 border border-secondary border-opacity-25 rounded">
                    Нічого не знайдено за вашим запитом.
                  </div>
                ) : (
                  <Row className="g-3">
                    {filteredCards.map((card) => (
                      <Col key={card.id} lg={6} xs={12}>
                        <Card className="h-100 bg-dark border-secondary shadow-sm">
                          <Card.Header className="bg-transparent border-secondary d-flex align-items-center justify-content-between py-2">
                            <span className="fw-bold fs-6">{card.title}</span>
                            <Badge bg="secondary" className="small">
                              {CATEGORY_NAMES[card.category] || card.category}
                            </Badge>
                          </Card.Header>
                          <Card.Body className="d-flex flex-column gap-2 small">
                            <div className="text-muted">
                              <span className="fw-semibold">Де знайти:</span>{' '}
                              <span className="text-info">{card.uiPath}</span>
                            </div>
                            <div>{card.summary}</div>
                            <div>
                              <strong className="text-light">
                                Для чого це потрібно:
                              </strong>{' '}
                              <span className="text-light text-opacity-75">
                                {card.whyUse}
                              </span>
                            </div>
                            <div>
                              <strong className="text-light">
                                Як використовувати:
                              </strong>{' '}
                              <span className="text-light text-opacity-75">
                                {card.howToUse}
                              </span>
                            </div>

                            {card.liveFacts &&
                              Object.keys(card.liveFacts).length > 0 && (
                                <div className="mt-2 pt-2 border-top border-secondary border-opacity-25">
                                  <strong>Поточні параметри / ліміти:</strong>
                                  <ul className="mb-0 mt-1 ps-3 text-light text-opacity-75">
                                    {Object.entries(card.liveFacts).map(
                                      ([k, v]) => (
                                        <li key={k}>
                                          <span className="text-muted">
                                            {k}:
                                          </span>{' '}
                                          <span>
                                            {Array.isArray(v)
                                              ? v.join(', ')
                                              : typeof v === 'boolean'
                                              ? v
                                                ? 'Так'
                                                : 'Ні'
                                              : String(v)}
                                          </span>
                                        </li>
                                      )
                                    )}
                                  </ul>
                                </div>
                              )}

                            <div className="mt-auto pt-3 d-flex justify-content-end">
                              <Button
                                size="sm"
                                variant="outline-info"
                                onClick={() => {
                                  onAskPrompt?.(
                                    `Розкажи детальніше про функцію "${card.title}" та як її найефективніше використовувати.`
                                  );
                                  onHide();
                                }}
                              >
                                Запитати AI про цю функцію
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}
              </div>
            </Tab>
          </Tabs>
        )}
      </Modal.Body>

      <Modal.Footer className="border-secondary bg-dark text-light d-flex justify-content-between">
        <small className="text-muted">
          Версія бази знань: #{knowledge?.versionHash || '—'}
        </small>
        <Button variant="secondary" size="sm" onClick={onHide}>
          Закрити
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default React.memo(SystemGuideModal);
