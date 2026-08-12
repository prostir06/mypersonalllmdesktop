import React from 'react';
import { Form } from 'react-bootstrap';

export type SystemPromptCardProps = {
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
};

export default function SystemPromptCard({
  systemPrompt,
  onSystemPromptChange,
}: SystemPromptCardProps) {
  return (
    <div className="glass-panel p-4 mb-4">
      <h6
        className="fw-semibold mb-3 text-muted text-uppercase"
        style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
      >
        💬 Системний промпт
      </h6>
      <Form.Group>
        <Form.Label htmlFor="system-prompt" className="small fw-semibold">
          Початкові інструкції для AI (опціонально)
        </Form.Label>
        <Form.Control
          id="system-prompt"
          as="textarea"
          rows={4}
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          placeholder="Наприклад: Ти — досвідчений Python-розробник. Відповідай лаконічно та з прикладами коду."
          className="bg-dark text-light border-secondary shadow-none"
          style={{ resize: 'vertical' }}
        />
        <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>
          Цей текст буде передано AI як системне повідомлення на початку кожної розмови.
        </Form.Text>
      </Form.Group>
    </div>
  );
}
