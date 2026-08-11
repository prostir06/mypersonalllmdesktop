import express from 'express';
import auth from '../middleware/auth';
import { getMe, updateMe } from '../controllers/usersController';
import { validateUserUpdate } from '../validators/usersValidator';

const router = express.Router();

router.get('/me', auth, getMe);
router.put('/me', auth, validateUserUpdate, updateMe);

export = router;
