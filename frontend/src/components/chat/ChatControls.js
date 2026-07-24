/**
 * @file components/chat/ChatControls.js
 * Панель управління чатом: провайдер, модель, температура,
 * кнопки бібліотеки промптів та RAG документів.
 */

import React from 'react';
import { Form, Button } from 'react-bootstrap';

/**
 * Компонент ChatControls.
 * Відображає панель інструментів для налаштування параметрів чату та виклику додаткових функцій.
 * Використовує React.memo для уникнення зайвих рендерів.
 *
 * @component
 * @param {Object} props - Властивості компонента
 * @param {string} props.selectedProvider - Поточний вибраний AI провайдер ('openai', 'ollama' тощо)
 * @param {function} props.onProviderChange - Обробник зміни провайдера
 * @param {string} props.selectedModel - Поточна вибрана модель
 * @param {function} props.onModelChange - Обробник зміни моделі
 * @param {Array<{value: string, label: string}>} props.availableModels - Список доступних моделей
 * @param {number} props.temperature - Поточне значення температури (від 0 до 1.5)
 * @param {function} props.onTemperatureChange - Обробник зміни температури генерації
 * @param {Array<number>} props.selectedDocIds - Масив ID вибраних RAG документів
 * @param {boolean} props.streaming - Прапорець, що вказує чи йде наразі стрімінг відповіді
 * @param {function} props.onShowPromptModal - Функція для відкриття модалки бібліотеки промптів
 * @param {function} props.onShowDocModal - Функція для відкриття модалки вибору документів (RAG)
 * @param {function} props.onExportChat - Функція для експорту чату (Markdown)
 * @param {number} props.messagesCount - Загальна кількість повідомлень у чаті (для відображення кнопки експорту)
 */
const ChatControls = React.memo(({
  selectedProvider,
  onProviderChange,
  selectedModel,
  onModelChange,
  availableModels,
  temperature,
  onTemperatureChange,
  selectedDocIds,
  streaming,
  onShowPromptModal,
  onShowDocModal,
  onExportChat,
  messagesCount,
}) => {
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pb-3 mb-3 border-bottom border-secondary border-opacity-25">
      <div className="d-flex align-items-center gap-2">
        <Form.Select
          size="sm"
          value={selectedProvider}
          onChange={onProviderChange}
          disabled={streaming}
          aria-label="Провайдер AI"
          className="bg-dark text-light border-secondary shadow-none"
          style={{ width: 'auto' }}
        >
          <option value="openai">⚡ OpenAI</option>
          <option value="ollama">🦙 Ollama (Local)</option>
        </Form.Select>

        <Form.Select
          size="sm"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={streaming}
          aria-label="Модель AI"
          className="bg-dark text-light border-secondary shadow-none"
          style={{ width: 'auto' }}
        >
          {availableModels.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </Form.Select>

        <Button
          variant="outline-info"
          size="sm"
          onClick={onShowPromptModal}
          title="Бібліотека готових системних ролей"
          className="d-flex align-items-center gap-1"
        >
          💡 Ролі AI
        </Button>

        <Button
          variant={selectedDocIds.length > 0 ? 'success' : 'outline-secondary'}
          size="sm"
          onClick={onShowDocModal}
          title="Прикріпити RAG документи"
          className="d-flex align-items-center gap-1"
        >
          📎 {selectedDocIds.length > 0 ? `RAG (${selectedDocIds.length})` : 'Документи'}
        </Button>

        {messagesCount > 0 && (
          <Button
            variant="outline-warning"
            size="sm"
            onClick={onExportChat}
            title="Експорт чату у Markdown"
            className="d-flex align-items-center gap-1"
          >
            💾 Експорт
          </Button>
        )}
      </div>

      <div className="d-flex align-items-center gap-2" style={{ minWidth: '180px' }}>
        <small className="text-muted">🌡 {temperature}</small>
        <Form.Range
          min="0"
          max="1.5"
          step="0.1"
          value={temperature}
          onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
          disabled={streaming}
          aria-label="Температура"
        />
      </div>
    </div>
  );
});

ChatControls.displayName = 'ChatControls';

export default ChatControls;
