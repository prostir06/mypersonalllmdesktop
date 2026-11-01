import express from 'express';
import auth from '../middleware/auth';
import { createUploadMiddleware } from '../middleware/upload';
import {
  sendMessage,
  streamMessage,
  getHistory,
  searchMessages,
  approveToolAction,
  rejectToolAction,
} from '../controllers/chatController';
import { uploadChatAttachment } from '../controllers/chatAttachmentsController';
import {
  validateChatSend,
  validateChatHistory,
  validateChatSearch,
} from '../validators/chatValidator';

const router = express.Router();
const chatAttachmentUpload = createUploadMiddleware({
  subdirectory: 'chat-temp',
  applyTypeFilter: true,
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
router.post('/tool-actions/:id/approve', auth, approveToolAction);
router.post('/tool-actions/:id/reject', auth, rejectToolAction);

export default router;
