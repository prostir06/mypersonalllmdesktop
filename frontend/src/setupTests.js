/**
 * @file setupTests.js
 * Налаштування середовища тестування для React Testing Library & Jest
 */

import '@testing-library/jest-dom';

// Мок для react-markdown (оскільки це ESM модуль)
jest.mock('react-markdown', () => {
  return function DummyMarkdown({ children }) {
    return <div data-testid="react-markdown">{children}</div>;
  };
});

// Мок для react-syntax-highlighter
jest.mock('react-syntax-highlighter', () => ({
  Prism: function DummySyntaxHighlighter({ children }) {
    return <pre data-testid="syntax-highlighter">{children}</pre>;
  }
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: {}
}));

// Мок для scrollIntoView у JSDOM
Element.prototype.scrollIntoView = jest.fn();
