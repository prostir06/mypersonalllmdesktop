import React from 'react';
import { Row, Col, Card, Badge } from 'react-bootstrap';
import { PRESET_PROMPTS } from './promptPresets';

type Props = {
  onSelectPrompt: (promptText: string) => Promise<void>;
  onHide: () => void;
};

export default function PromptPresetsTab({ onSelectPrompt, onHide }: Props) {
  return (
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
                  // Caller (ChatBoxModals) already toasted; swallow to keep modal open.
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
  );
}
