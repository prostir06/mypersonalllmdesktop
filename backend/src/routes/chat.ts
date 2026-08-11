import express from 'express';
import auth from '../middleware/auth';
import {
  sendMessage,
  streamMessage,
  getHistory,
  searchMessages,
} from '../controllers/chatController';
import {
  validateChatSend,
  validateChatHistory,
  validateChatSearch,
} from '../validators/chatValidator';

const router = express.Router();

router.post('/send', auth, validateChatSend, sendMessage);
router.post('/stream', auth, validateChatSend, streamMessage);
router.get('/history/:conversationId', auth, validateChatHistory, getHistory);
router.get('/search', auth, validateChatSearch, searchMessages);

export = router;
