import express from 'express';
import auth from '../middleware/auth';
import {
  sendMessage,
  streamMessage,
  getHistory,
  searchMessages,
} from '../controllers/chatController';

const router = express.Router();

router.post('/send', auth, sendMessage);
router.post('/stream', auth, streamMessage);
router.get('/history/:conversationId', auth, getHistory);
router.get('/search', auth, searchMessages);

export = router;
