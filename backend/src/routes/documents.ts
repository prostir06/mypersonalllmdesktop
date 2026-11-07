import express from 'express';
import auth from '../middleware/auth';
import { createUploadMiddleware } from '../middleware/upload';
import {
  uploadDocument,
  listDocuments,
  getDocumentStatuses,
  getDocument,
  deleteDocument,
  getDocumentChunks,
  retryDocument,
  reindexDocument,
} from '../controllers/documentsController';

const router = express.Router();
const upload = createUploadMiddleware({ applyTypeFilter: true });

router.post('/upload', auth, upload.single('file'), uploadDocument);
router.get('/', auth, listDocuments);
router.get('/status', auth, getDocumentStatuses);
router.get('/:id/chunks', auth, getDocumentChunks);
router.post('/:id/reindex', auth, reindexDocument);
router.post('/:id/retry', auth, retryDocument);
router.get('/:id', auth, getDocument);
router.delete('/:id', auth, deleteDocument);

export default router;
