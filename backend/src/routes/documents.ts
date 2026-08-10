import express from 'express';
const multer = require('multer');
import auth from '../middleware/auth';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  getDocumentChunks,
  retryDocument,
} from '../controllers/documentsController';
import { getMaxUploadBytes } from '../utils/fileMagic';

const router = express.Router();

const upload = multer({
  limits: { fileSize: getMaxUploadBytes() },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string; originalname: string },
    cb: (error: Error | null, acceptFile?: boolean) => void
  ) => {
    try {
      const allowedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
      ];

      if (
        allowedMimeTypes.includes(file.mimetype) ||
        (file.originalname && file.originalname.match(/\.(pdf|docx|txt|md)$/i))
      ) {
        cb(null, true);
      } else {
        cb(new Error('Непідтримуваний формат файлу. Дозволено: PDF, DOCX, TXT, MD'));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      cb(new Error(`Помилка при перевірці файлу: ${message}`));
    }
  },
});

router.post('/upload', auth, upload.single('file'), uploadDocument);
router.get('/', auth, listDocuments);
router.get('/:id/chunks', auth, getDocumentChunks);
router.post('/:id/retry', auth, retryDocument);
router.get('/:id', auth, getDocument);
router.delete('/:id', auth, deleteDocument);

export = router;
