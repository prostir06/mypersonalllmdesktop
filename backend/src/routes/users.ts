import express from 'express';
import auth from '../middleware/auth';
import { changePassword, getMe, updateMe } from '../controllers/usersController';
import { validateUserUpdate } from '../validators/usersValidator';
import {
  createUserMemoryNote,
  deleteUserMemoryNote,
  listUserMemoryNotes,
  updateUserMemoryNote,
} from '../controllers/userMemoryController';

const router = express.Router();

router.get('/me', auth, getMe);
router.put('/me', auth, validateUserUpdate, updateMe);
router.post('/me/password', auth, changePassword);

router.get('/me/memory-notes', auth, listUserMemoryNotes);
router.post('/me/memory-notes', auth, createUserMemoryNote);
router.patch('/me/memory-notes/:noteId', auth, updateUserMemoryNote);
router.delete('/me/memory-notes/:noteId', auth, deleteUserMemoryNote);

export default router;
