import type { TourStep } from '../types/tour';

export { CURRENT_TOUR_VERSION, TOUR_STORAGE_KEY } from './tourVersion';

export const productTourSteps: TourStep[] = [
  {
    id: 'sidebar-search',
    target: '[data-tour="sidebar-search"]',
    title: 'Керування розмовами та пошук',
    content: 'Створюйте нові діалоги, закріплюйте важливі та миттєво фільтруйте список розмов у реальному часі.',
    placement: 'right',
  },
  {
    id: 'model-selector',
    target: '[data-tour="model-selector"]',
    title: 'Мультипровайдерні моделі',
    content: 'Обирайте між передовими моделями OpenAI, Google Gemini, Anthropic Claude та локальними моделями Ollama.',
    placement: 'bottom',
  },
  {
    id: 'tools-toggle',
    target: '[data-tour="tools-toggle"]',
    title: 'Автономні інструменти',
    content: 'Дозволяйте моделі самостійно шукати інформацію, дізнаватися точний час та запитувати підтвердження на важливі дії.',
    placement: 'bottom',
    isNew: true,
  },
  {
    id: 'web-search-toggle',
    target: '[data-tour="web-search-toggle"]',
    title: 'Універсальний вебпошук',
    content: 'Отримуйте найактуальніші факти з інтернету через SearXNG або Tavily з перевіреними цитатами джерел.',
    placement: 'bottom',
    isNew: true,
  },
  {
    id: 'message-input',
    target: '[data-tour="message-input"]',
    title: 'Ввід, файли та промпти',
    content: 'Прикріплюйте документи (PDF, Word, Excel) для відповідей по ваших файлах або обирайте готові ролі з бібліотеки.',
    placement: 'top',
  },
  {
    id: 'header-actions',
    target: '[data-tour="header-actions"]',
    title: 'Налаштування та системні знання',
    content: 'Керуйте API-ключами, переглядайте нотатки пам’яті та знайомтеся з архітектурою через Системний гід.',
    placement: 'bottom',
  },
];
