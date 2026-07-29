import express from 'express';
import auth from '../middleware/auth';
import {
  listModels,
  createModel,
  updateModel,
  deleteModel,
  listRemoteModels,
} from '../controllers/modelsController';

const router = express.Router();

// /remote BEFORE /:modelId
router.get('/remote', listRemoteModels);

router.get('/', auth, listModels);
router.post('/', auth, createModel);
router.put('/:modelId', auth, updateModel);
router.delete('/:modelId', auth, deleteModel);

export = router;
