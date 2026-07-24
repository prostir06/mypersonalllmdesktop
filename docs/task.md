# Task: Аудит проєкту, JSON стандартизація, коментарі та Unit-тести

## 1. Стандартизація відповідей та обробка помилок (Try/Catch)
- [x] `backend/src/routes/conversations.js`: Замінити `res.send()` на `res.json()`, додати try/catch де потрібно.
- [x] `backend/src/controllers/chatController.js`: Перевірити та переконатись у наявності try/catch і `{ error: '...' }` скрізь.

## 2. Додавання детальних коментарів (JSDoc)
- [x] `backend/src/services/DocumentService.js`
- [x] `backend/src/services/EmbeddingService.js`
- [x] `frontend/src/components/chat/ChatControls.js`
- [x] `frontend/src/components/chat/MessageInput.js`

## 3. Написання Unit-тестів (Jest)
- [x] `backend/src/__tests__/DocumentService.test.js`
- [x] `backend/src/__tests__/EmbeddingService.test.js`
- [x] `frontend/src/__tests__/ChatControls.test.js`
- [x] `frontend/src/__tests__/MessageInput.test.js`
