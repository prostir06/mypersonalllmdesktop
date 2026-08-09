/**
 * Preset system-prompt roles modal.
 */

import React from 'react';
import { Modal, Button, Row, Col, Card, Badge } from 'react-bootstrap';

const PRESET_PROMPTS = [
  {
    id: 'python-dev',
    icon: '🐍',
    title: 'Senior Python Developer',
    category: 'Розробка',
    prompt: `Ти — досвідчений Senior Python розробник. Надавай чистий, ефективний та об'єктивно-орієнтований код за стандартами PEP 8 з детальною обробкою помилок (try/except) та типуванням.`
  },
  {
    id: 'code-reviewer',
    icon: '🔍',
    title: 'Code Reviewer & Auditor',
    category: 'Розробка',
    prompt: `Ти — експерт з аудиту та рев'ю коду. Аналізуй наданий код на наявність багів, вразливостей безпеки, витоків пам'яті та пропонуй оптимізації у вигляді корисного diff.`
  },
  {
    id: 'translator-uk',
    icon: '🌐',
    title: 'Професійний Перекладач',
    category: 'Текст',
    prompt: `Ти — професійний лінгвіст та перекладач. Перекладай тексти українською мовою з дотриманням природної лексики, стилістики та збереженням професійної термінології.`
  },
  {
    id: 'data-analyst',
    icon: '📊',
    title: 'Data Analyst & SQL Expert',
    category: 'Аналітика',
    prompt: `Ти — експерт з аналізу даних та PostgreSQL. Допомагай складати складні SQL-запити, індекси, аналізувати структуру БД та будувати агрегати.`
  },
  {
    id: 'copywriter',
    icon: '✍️',
    title: 'Креативний Копірайтер',
    category: 'Текст',
    prompt: `Ти — професійний копірайтер та контент-мейкер. Створюй захоплюючі, структуровані дописи для блогів, соцмереж та презентацій.`
  },
  {
    id: 'technical-writer',
    icon: '📚',
    title: 'Technical Writer',
    category: 'Документація',
    prompt: `Ти — технічний письменник. Пиши чітку, вичерпну та легкозрозумілу технічну документацію, README файли та API специфікації у форматі Markdown.`
  }
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
  return (
    <Modal show={show} onHide={onHide} size="lg" centered className="glass-modal">
      <Modal.Header closeButton className="border-secondary bg-dark text-light">
        <Modal.Title className="fw-bold fs-5 d-flex align-items-center gap-2">
          <span>💡</span> Бібліотека готових системних ролей AI
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light p-4">
        <p className="text-muted small mb-3">
          Оберіть роль для вашого асистента, щоб встановити її у якості початкової інструкції для діалогу.
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
                  } catch {
                    // parent shows toast; keep modal open for retry
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
                <p className="text-muted small mb-0" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                  {item.prompt.length > 110 ? `${item.prompt.substring(0, 110)}...` : item.prompt}
                </p>
              </Card>
            </Col>
          ))}
        </Row>
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
