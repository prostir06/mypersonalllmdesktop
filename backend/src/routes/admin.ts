import express from 'express';
import auth from '../middleware/auth';
import requireAdmin from '../middleware/requireAdmin';
import { getInvites, getSpend, getUsers, patchUser, postInvite } from '../controllers/adminController';

const router = express.Router();

router.use(auth, requireAdmin);
router.get('/users', getUsers);
router.patch('/users/:id', patchUser);
router.get('/spend', getSpend);
router.get('/invites', getInvites);
router.post('/invites', postInvite);

export default router;
