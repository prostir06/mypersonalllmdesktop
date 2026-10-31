import express from 'express';
import auth from '../middleware/auth';
import { getSystemKnowledge } from '../controllers/systemController';

const router = express.Router();

router.get('/knowledge', auth, getSystemKnowledge);

export default router;
