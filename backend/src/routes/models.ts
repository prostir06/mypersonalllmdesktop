import express from 'express';
import auth from '../middleware/auth';
import {
  listModels,
  createModel,
  updateModel,
  deleteModel,
  listRemoteModels,
} from '../controllers/modelsController';
import {
  validateModelCreate,
  validateModelUpdate,
  validateModelId,
} from '../validators/modelsValidator';

const router = express.Router();

router.get('/remote', auth, listRemoteModels);

router.get('/', auth, listModels);
router.post('/', auth, validateModelCreate, createModel);
router.put('/:modelId', auth, validateModelUpdate, updateModel);
router.delete('/:modelId', auth, validateModelId, deleteModel);

export default router;
