import express from 'express';
import auth from '../middleware/auth';
import { getMe, updateMe } from '../controllers/usersController';

const router = express.Router();

router.get('/me', auth, getMe);
router.put('/me', auth, updateMe);

export = router;
