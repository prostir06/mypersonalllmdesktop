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
import {
  getMemory,
  createMemoryNote,
  updateMemoryNote,
  deleteMemoryNote,
  refreshSummary,
} from '../controllers/conversationMemoryController';

const router = express.Router();

router.get('/', auth, listConversations);
router.post('/', auth, createConversation);

// export BEFORE /:conversationId
router.get('/:conversationId/export', auth, exportConversation);

// memory routes BEFORE /:conversationId
router.get('/:conversationId/memory', auth, getMemory);
router.post('/:conversationId/memory-notes', auth, createMemoryNote);
router.patch('/:conversationId/memory-notes/:noteId', auth, updateMemoryNote);
router.delete('/:conversationId/memory-notes/:noteId', auth, deleteMemoryNote);
router.post('/:conversationId/memory/refresh-summary', auth, refreshSummary);

router.get('/:conversationId', auth, getConversation);
router.put('/:conversationId', auth, updateConversation);
router.delete('/:conversationId', auth, deleteConversation);

export default router;
