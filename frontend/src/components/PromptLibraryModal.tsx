/**
 * Preset system-prompt roles + user saved/pinned prompts.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Button,
  Row,
  Col,
  Card,
  Badge,
  Form,
  Nav,
  Spinner,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { promptsAPI } from '../services/api';
import type { UserPrompt } from '../types/api';

const PRESET_PROMPTS = [
  {
    id: 'python-dev',
    icon: '🐍',
    title: 'Senior Python Developer',
    category: 'Розробка',
    prompt: `Ти — досвідчений Senior Python розробник. Надавай чистий, ефективний та об'єктивно-орієнтований код за стандартами PEP 8 з детальною обробкою помилок (try/except) та типуванням.`,
  },
  {
    id: 'code-reviewer',
    icon: '🔍',
    title: 'Code Reviewer & Auditor',
    category: 'Розробка',
    prompt: `Ти — експерт з аудиту та рев'ю коду. Аналізуй наданий код на наявність багів, вразливостей безпеки, витоків пам'яті та пропонуй оптимізації у вигляді корисного diff.`,
  },
  {
    id: 'translator-uk',
    icon: '🌐',
    title: 'Професійний Перекладач',
    category: 'Текст',
    prompt: `Ти — професійний лінгвіст та перекладач. Перекладай тексти українською мовою з дотриманням природної лексики, стилістики та збереженням професійної термінології.`,
  },
  {
    id: 'data-analyst',
    icon: '📊',
    title: 'Data Analyst & SQL Expert',
    category: 'Аналітика',
    prompt: `Ти — експерт з аналізу даних та PostgreSQL. Допомагай складати складні SQL-запити, індекси, аналізувати структуру БД та будувати агрегати.`,
  },
  {
    id: 'copywriter',
    icon: '✍️',
    title: 'Креативний Копірайтер',
    category: 'Текст',
    prompt: `Ти — професійний копірайтер та контент-мейкер. Створюй захоплюючі, структуровані дописи для блогів, соцмереж та презентацій.`,
  },
  {
    id: 'technical-writer',
    icon: '📚',
    title: 'Technical Writer',
    category: 'Документація',
    prompt: `Ти — технічний письменник. Пиши чітку, вичерпну та легкозрозумілу технічну документацію, README файли та API специфікації у форматі Markdown.`,
  },
];

const PromptLibraryModal = ({
  show,
  onHide,
  onSelectPrompt,
}: {
  show: boolean;
  onHide: () => void;
  onSelectPrompt: (promptText: string) => Promise<void>;
}) => {
  const [tab, setTab] = useState<'presets' | 'mine'>('presets');
  const [userPrompts, setUserPrompts] = useState<UserPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [pinNew, setPinNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadUserPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await promptsAPI.getAll();
      setUserPrompts(Array.isArray(res.data) ? res.data : []);
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Не вдалося завантажити промпти');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (show && tab === 'mine') void loadUserPrompts();
  }, [show, tab, loadUserPrompts]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newPrompt.trim()) {
      toast.warn('Вкажіть назву та текст промпту');
      return;
    }
    setSaving(true);
    try {
      await promptsAPI.create({
        title: newTitle.trim(),
        prompt: newPrompt.trim(),
        is_pinned: pinNew,
      });
      setNewTitle('');
      setNewPrompt('');
      setPinNew(false);
      toast.success('Промпт збережено');
      await loadUserPrompts();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (p: UserPrompt) => {
    try {
      await promptsAPI.update(p.id, { is_pinned: !p.is_pinned });
      await loadUserPrompts();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка оновлення');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await promptsAPI.delete(id);
      await loadUserPrompts();
      toast.info('Промпт видалено');
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка видалення');
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered className="glass-modal">
      <Modal.Header closeButton className="border-secondary bg-dark text-light">
        <Modal.Title className="fw-bold fs-5 d-flex align-items-center gap-2">
          <span>💡</span> Бібліотека промптів
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light p-4">
        <Nav variant="tabs" className="mb-3 border-secondary">
          <Nav.Item>
            <Nav.Link
              active={tab === 'presets'}
              onClick={() => setTab('presets')}
              className="text-light"
            >
              Готові ролі
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link
              active={tab === 'mine'}
              onClick={() => setTab('mine')}
              className="text-light"
            >
              Мої промпти
            </Nav.Link>
          </Nav.Item>
        </Nav>

        {tab === 'presets' && (
          <>
            <p className="text-muted small mb-3">
              Оберіть роль — вона стане системною інструкцією для діалогу.
            </p>
            <Row className="g-3">
              {PRESET_PROMPTS.map((item) => (
                <Col md={6} key={item.id}>
                  <Card
                    className="bg-dark text-light border-secondary h-100 p-3 hover-shadow"
                    style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onClick={async () => {
                      try {
                        await onSelectPrompt(item.prompt);
                        onHide();
                      } catch (err) {
                        console.warn('Preset prompt apply failed:', err);
                      }
                    }}
                  >
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
                        <strong className="small">{item.title}</strong>
                      </div>
                      <Badge bg="indigo" className="bg-opacity-25 text-primary small">
                        {item.category}
                      </Badge>
                    </div>
                    <p
                      className="text-muted small mb-0"
                      style={{ fontSize: '0.8rem', lineHeight: '1.4' }}
                    >
                      {item.prompt.length > 110
                        ? `${item.prompt.substring(0, 110)}...`
                        : item.prompt}
                    </p>
                  </Card>
                </Col>
              ))}
            </Row>
          </>
        )}

        {tab === 'mine' && (
          <>
            <p className="text-muted small mb-3">
              Збережені промпти. Закріплені (📌) додаються до кожного запиту як
              контекст.
            </p>

            <Card className="bg-dark text-light border-secondary p-3 mb-3">
              <Form.Group className="mb-2">
                <Form.Label className="small">Назва</Form.Label>
                <Form.Control
                  size="sm"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="bg-dark text-light border-secondary"
                  maxLength={255}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label className="small">Текст промпту</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  className="bg-dark text-light border-secondary"
                />
              </Form.Group>
              <div className="d-flex justify-content-between align-items-center">
                <Form.Check
                  type="checkbox"
                  id="pin-new-prompt"
                  label="Закріпити для всіх чатів"
                  checked={pinNew}
                  onChange={(e) => setPinNew(e.target.checked)}
                  className="small text-muted"
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={saving}
                  onClick={() => void handleCreate()}
                >
                  {saving ? 'Збереження...' : 'Зберегти'}
                </Button>
              </div>
            </Card>

            {loading ? (
              <div className="text-center py-4">
                <Spinner animation="border" size="sm" variant="primary" />
              </div>
            ) : userPrompts.length === 0 ? (
              <p className="text-muted small text-center py-3">
                Ще немає збережених промптів
              </p>
            ) : (
              <Row className="g-2">
                {userPrompts.map((p) => (
                  <Col md={12} key={p.id}>
                    <Card className="bg-dark text-light border-secondary p-3">
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <div className="flex-grow-1">
                          <strong className="small">
                            {p.is_pinned ? '📌 ' : ''}
                            {p.title}
                          </strong>
                          <p
                            className="text-muted small mb-0 mt-1"
                            style={{ fontSize: '0.8rem' }}
                          >
                            {p.prompt.length > 140
                              ? `${p.prompt.substring(0, 140)}...`
                              : p.prompt}
                          </p>
                        </div>
                        <div className="d-flex gap-1 flex-shrink-0">
                          <Button
                            variant="outline-info"
                            size="sm"
                            title="Встановити як системну роль"
                            onClick={async () => {
                              try {
                                await onSelectPrompt(p.prompt);
                                onHide();
                              } catch (err) {
                                console.warn('Saved prompt apply failed:', err);
                              }
                            }}
                          >
                            ✓
                          </Button>
                          <Button
                            variant={p.is_pinned ? 'warning' : 'outline-secondary'}
                            size="sm"
                            title={p.is_pinned ? 'Відкріпити' : 'Закріпити'}
                            onClick={() => void togglePin(p)}
                          >
                            📌
                          </Button>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            title="Видалити"
                            onClick={() => void handleDelete(p.id)}
                          >
                            🗑
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="border-secondary bg-dark text-light">
        <Button variant="secondary" size="sm" onClick={onHide}>
          Закрити
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PromptLibraryModal;
