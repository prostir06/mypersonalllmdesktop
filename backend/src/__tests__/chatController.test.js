/**
 * @file chatController.test.js
 * Unit та інтеграційні тести для ChatController
 * Стандарт: StandardJS / Jest
 */

const ChatController = require('../controllers/chatController')
const pool = require('../config/database')
const ProviderFactory = require('../services/providerFactory')

// Мокаємо залежності для ізольованого тестування
jest.mock('../config/database')
jest.mock('../services/providerFactory')
jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}))

describe('ChatController Unit Tests', () => {
  let req, res, next

  beforeEach(() => {
    jest.clearAllMocks()
    req = {
      body: {},
      params: {},
      query: {},
      userId: 1
    }
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn()
    }
    next = jest.fn()
  })

  test('sendMessage повинен повертати 400 якщо повідомлення порожнє', async () => {
    req.body = { message: '' }

    await ChatController.sendMessage(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Message is required' })
  })

  test('sendMessage повинен успішно обробляти повідомлення та повертати JSON', async () => {
    req.body = {
      conversationId: 10,
      message: 'Привіт, AI!',
      model: 'gpt-3.5-turbo',
      provider: 'openai'
    }

    // Мокаємо послідовні виклики pool.query
    pool.query
      .mockResolvedValueOnce({ rows: [{ user_id: 1 }] }) // 1. convCheck
      .mockResolvedValueOnce({ rows: [] }) // 2. messagesResult
      .mockResolvedValueOnce({ rows: [] }) // 3. buildSystemContext (system_prompt)
      .mockResolvedValueOnce({ rows: [] }) // 4. insert user msg
      .mockResolvedValueOnce({ rows: [{ id: 101, created_at: '2026-07-23T10:00:00Z' }] }) // 5. insert assistant msg
      .mockResolvedValueOnce({ rows: [] }) // 6. update conversation

    // Мокаємо відповідь провайдера
    ProviderFactory.sendMessage.mockResolvedValueOnce({
      content: 'Привіт! Чим можу допомогти?',
      usage: { total_tokens: 25 }
    })

    await ChatController.sendMessage(req, res, next)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 10,
        messageId: 101,
        content: 'Привіт! Чим можу допомогти?',
        role: 'assistant'
      })
    )
  })

  test('streamMessage повинен повертати 400 якщо message порожній', async () => {
    req.body = { message: '   ' }

    await ChatController.streamMessage(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Message is required' })
  })
})
