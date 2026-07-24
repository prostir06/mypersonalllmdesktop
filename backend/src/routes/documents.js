/**
 * @file routes/documents.js
 * REST API для системи RAG: завантаження, отримання та видалення документів.
 * Бізнес-логіка (парсинг, чанкінг, БД) делегується DocumentService.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const logger = require('../logger');
const DocumentService = require('../services/DocumentService');

// Налаштування multer для обробки завантажених файлів у пам'яті (Memory Storage)
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // Максимум 10 МБ
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ];
    if (
      allowedMimeTypes.includes(file.mimetype) ||
      file.originalname.match(/\.(pdf|docx|txt|md)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Непідтримуваний формат файлу. Дозволено: PDF, DOCX, TXT, MD'));
    }
  }
});

/**
 * POST /api/documents/upload
 * Завантажує документ, витягує текст, виконує чанкінг та зберігає в БД
 */
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Будь ласка, виберіть файл для завантаження' });
  }

  try {
    const result = await DocumentService.uploadAndProcess(req.file, req.userId);

    res.status(201).json({
      document: result.document,
      chunksCount: result.chunksCount,
      message: 'Файл успішно опрацьовано та збережено для RAG'
    });
  } catch (error) {
    logger.error(`POST /documents/upload error: ${error.message}`);
    if (error.message.includes('витягти текст')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: `Помилка обробки файлу: ${error.message}` });
  }
});

/**
 * GET /api/documents
 * Отримує список усіх завантажених документів поточного користувача
 */
router.get('/', auth, async (req, res) => {
  try {
    const documents = await DocumentService.getByUser(req.userId);
    res.json(documents);
  } catch (error) {
    logger.error(`GET /documents error: ${error.message}`);
    res.status(500).json({ error: 'Не вдалося отримати список документів' });
  }
});

/**
 * DELETE /api/documents/:id
 * Видаляє документ та його фрагменти
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await DocumentService.delete(req.params.id, req.userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }

    res.json({ success: true, message: 'Документ видалено' });
  } catch (error) {
    logger.error(`DELETE /documents/${req.params.id} error: ${error.message}`);
    res.status(500).json({ error: 'Не вдалося видалити документ' });
  }
});

module.exports = router;
