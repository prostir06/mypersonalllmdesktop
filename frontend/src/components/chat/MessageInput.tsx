/**
 * Message composer with STT, vision attach, and stop-while-streaming.
 */
import React, { type FormEvent, type KeyboardEvent } from 'react';
import { Form, Button } from 'react-bootstrap';
import type { AttachedImage } from '../../hooks/useChatStream';

export type MessageInputProps = {
  inputMessage: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  isListening: boolean;
  onToggleListening: () => void;
  streaming: boolean;
  onStop: () => void;
  attachedImage: AttachedImage | null;
  onClearImage: () => void;
  onAttachImage: () => void;
  supportsVision: boolean;
};

const MessageInput = React.memo(function MessageInput({
  inputMessage,
  onInputChange,
  onSubmit,
  isListening,
  onToggleListening,
  streaming,
  onStop,
  attachedImage,
  onClearImage,
  onAttachImage,
  supportsVision,
}: MessageInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  return (
    <div>
      {attachedImage && (
        <div
          className="mb-2 d-flex align-items-center gap-2 p-2"
          style={{
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.25)',
          }}
        >
          <img
            src={attachedImage.url}
            alt="Прикріплене зображення"
            style={{
              height: 56,
              width: 56,
              objectFit: 'cover',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          />
          <small className="text-muted flex-grow-1">
            🖼️ Зображення буде передано моделі
          </small>
          <Button
            variant="link"
            size="sm"
            onClick={onClearImage}
            className="p-0 text-danger text-decoration-none"
            title="Видалити зображення"
          >
            ✕
          </Button>
        </div>
      )}

      <Form onSubmit={onSubmit} className="d-flex gap-2 align-items-end">
        <Form.Control
          as="textarea"
          rows={2}
          placeholder="Напишіть запитання... (Enter — надіслати, Shift+Enter — новий рядок)"
          value={inputMessage}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          aria-label="Введення повідомлення"
          className="bg-dark text-light border-secondary shadow-none"
          style={{ resize: 'none' }}
        />

        {supportsVision && (
          <Button
            type="button"
            variant={attachedImage ? 'info' : 'outline-info'}
            onClick={onAttachImage}
            disabled={streaming}
            title="Додати зображення (Vision)"
            className="py-3 px-3"
          >
            🖼️
          </Button>
        )}

        <Button
          type="button"
          variant={isListening ? 'danger' : 'outline-primary'}
          onClick={onToggleListening}
          disabled={streaming}
          title={isListening ? 'Зупинити запис' : 'Голосове введення (STT)'}
          className="py-3 px-3"
        >
          {isListening ? '⏹️' : '🎤'}
        </Button>

        {streaming ? (
          <Button
            type="button"
            variant="danger"
            className="px-4 py-3"
            onClick={onStop}
            title="Зупинити генерацію"
          >
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            className="btn-accent px-4 py-3 d-flex align-items-center gap-2"
            disabled={!inputMessage.trim()}
          >
            <span>Надіслати 🚀</span>
          </Button>
        )}
      </Form>
    </div>
  );
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;
