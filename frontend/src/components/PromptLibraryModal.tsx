/**
 * Preset system-prompt roles + user saved/pinned prompts.
 */
import React, { useState } from 'react';
import { Modal, Button, Nav } from 'react-bootstrap';
import PromptPresetsTab from './promptLibrary/PromptPresetsTab';
import PromptMineTab from './promptLibrary/PromptMineTab';

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
          <PromptPresetsTab onSelectPrompt={onSelectPrompt} onHide={onHide} />
        )}
        {tab === 'mine' && (
          <PromptMineTab
            show={show}
            onSelectPrompt={onSelectPrompt}
            onHide={onHide}
          />
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
