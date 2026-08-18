import express from 'express';
import path from 'path';
import fs from 'fs';
const multer = require('multer');
import auth from '../middleware/auth';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  getDocumentChunks,
  retryDocument,
  reindexDocument,
} from '../controllers/documentsController';
import { getMaxUploadBytes } from '../utils/fileMagic';

const router = express.Router();

const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req: unknown, _file: unknown, cb: (err: Error | null, dest: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (_req: unknown, file: { originalname: string }, cb: (err: Error | null, name: string) => void) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
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
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/markdown',
      ];

      if (
        allowedMimeTypes.includes(file.mimetype) ||
        (file.originalname && file.originalname.match(/\.(pdf|docx|xlsx|txt|md)$/i))
      ) {
        cb(null, true);
      } else {
        cb(new Error('Непідтримуваний формат файлу. Дозволено: PDF, DOCX, XLSX, TXT, MD'));
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
router.post('/:id/reindex', auth, reindexDocument);
router.post('/:id/retry', auth, retryDocument);
router.get('/:id', auth, getDocument);
router.delete('/:id', auth, deleteDocument);

export = router;
