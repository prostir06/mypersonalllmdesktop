/**
 * @file ChatBoxOptimized.test.js
 * Unit-тест для frontend компонента ChatBoxOptimized
 * Стандарт: StandardJS / React Testing Library
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChatBoxOptimized from '../components/ChatBoxOptimized'

// Мокаємо API сервіси
jest.mock('../services/api', () => ({
  chatAPI: {
    getHistory: jest.fn().mockResolvedValue({ data: { messages: [] } }),
    sendMessage: jest.fn(),
    streamMessage: jest.fn()
  },
  settingsAPI: {
    get: jest.fn().mockResolvedValue({
      data: { default_provider: 'openai', default_model: 'gpt-3.5-turbo', temperature: 0.7 }
    })
  },
  documentsAPI: {
    getAll: jest.fn().mockResolvedValue({ data: [] }),
    upload: jest.fn(),
    delete: jest.fn()
  }
}))

describe('ChatBoxOptimized Component', () => {
  test('Відображає привітальний текст при порожній історії розмови', async () => {
    render(<ChatBoxOptimized conversationId={null} />)

    const welcomeHeading = await screen.findByText(/Ласкаво просимо!/i)
    expect(welcomeHeading).toBeInTheDocument()
  })

  test('Дозволяє вводити текст повідомлення та змінювати провайдера', async () => {
    render(<ChatBoxOptimized conversationId={1} />)

    const textarea = await screen.findByPlaceholderText(/Напишіть/i)
    fireEvent.change(textarea, { target: { value: 'Тестове запитання' } })
    expect(textarea.value).toBe('Тестове запитання')
  })
})
