import express from 'express';
import auth from '../middleware/auth';
import {
  listPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
} from '../controllers/promptsController';
import {
  validatePromptCreate,
  validatePromptUpdate,
  validatePromptId,
} from '../validators/promptsValidator';

const router = express.Router();

router.get('/', auth, listPrompts);
router.post('/', auth, validatePromptCreate, createPrompt);
router.put('/:promptId', auth, validatePromptUpdate, updatePrompt);
router.delete('/:promptId', auth, validatePromptId, deletePrompt);

export default router;
