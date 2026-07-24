/**
 * @file components/chat/MessageInput.js
 * Поле введення повідомлення з кнопками STT (голосовий ввід), Vision (зображення) та надіслати.
 * Вилучений з ChatBoxOptimized.js для кращої читабельності та підтримки.
 */

import React from 'react';
import { Form, Button, Spinner } from 'react-bootstrap';

/**
 * Компонент MessageInput.
 * Забезпечує поле введення повідомлень користувача з підтримкою Voice-to-Text (STT) 
 * та можливістю прикріплення зображень (Vision API).
 *
 * @component
 * @param {Object} props - Властивості компонента
 * @param {string} props.inputMessage - Поточний текст повідомлення
 * @param {function} props.onInputChange - Обробник зміни тексту повідомлення
 * @param {function} props.onSubmit - Обробник відправки повідомлення (натискання кнопки або Enter)
 * @param {boolean} props.isListening - Стан запису голосу (STT активний чи ні)
 * @param {function} props.onToggleListening - Обробник увімкнення/вимкнення мікрофону для STT
 * @param {boolean} props.streaming - Прапорець, що блокує ввід під час стрімінгу відповіді
 * @param {Object|null} props.attachedImage - Об'єкт прикріпленого зображення { url, base64 }
 * @param {function} props.onClearImage - Обробник видалення прикріпленого зображення
 * @param {function} props.onAttachImage - Обробник кліку на кнопку "Прикріпити зображення"
 * @param {boolean} props.supportsVision - Чи підтримує поточна модель роботу з зображеннями
 */
const MessageInput = React.memo(({
  inputMessage,
  onInputChange,
  onSubmit,
  isListening,
  onToggleListening,
  streaming,
  attachedImage,
  onClearImage,
  onAttachImage,
  supportsVision,
}) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  return (
    <div>
      {/* Попередній перегляд прикріпленого зображення (Vision) */}
      {attachedImage && (
        <div
          className="mb-2 d-flex align-items-center gap-2 p-2 rounded-3"
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
              border: '1px solid rgba(255,255,255,0.15)'
            }}
          />
          <small className="text-muted flex-grow-1">🖼️ Зображення буде передано моделі</small>
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

        {/* Vision кнопка (лише для моделей що підтримують зображення) */}
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

        <Button
          type="submit"
          className="btn-accent px-4 py-3 d-flex align-items-center gap-2"
          disabled={streaming || !inputMessage.trim()}
        >
          {streaming ? <Spinner size="sm" animation="border" /> : <span>Надіслати 🚀</span>}
        </Button>
      </Form>
    </div>
  );
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;
