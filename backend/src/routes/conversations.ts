import express from 'express';
import auth from '../middleware/auth';
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  exportConversation,
} from '../controllers/conversationsController';

const router = express.Router();

router.get('/', auth, listConversations);
router.post('/', auth, createConversation);

// export BEFORE /:conversationId
router.get('/:conversationId/export', auth, exportConversation);

router.get('/:conversationId', auth, getConversation);
router.put('/:conversationId', auth, updateConversation);
router.delete('/:conversationId', auth, deleteConversation);

export = router;
