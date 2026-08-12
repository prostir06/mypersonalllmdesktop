import express from 'express';
import path from 'path';
import fs from 'fs';
const multer = require('multer');
import auth from '../middleware/auth';
import {
  sendMessage,
  streamMessage,
  getHistory,
  searchMessages,
} from '../controllers/chatController';
import { uploadChatAttachment } from '../controllers/chatAttachmentsController';
import {
  validateChatSend,
  validateChatHistory,
  validateChatSearch,
} from '../validators/chatValidator';
import { getMaxUploadBytes } from '../utils/fileMagic';

const router = express.Router();

const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads', 'chat-temp');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const chatAttachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (
      _req: unknown,
      _file: unknown,
      cb: (err: Error | null, dest: string) => void
    ) => cb(null, uploadsDir),
    filename: (
      _req: unknown,
      file: { originalname: string },
      cb: (err: Error | null, name: string) => void
    ) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: getMaxUploadBytes() },
});

router.post('/send', auth, validateChatSend, sendMessage);
router.post('/stream', auth, validateChatSend, streamMessage);
router.post(
  '/attachments',
  auth,
  chatAttachmentUpload.single('file'),
  uploadChatAttachment
);
router.get('/history/:conversationId', auth, validateChatHistory, getHistory);
router.get('/search', auth, validateChatSearch, searchMessages);

export = router;
