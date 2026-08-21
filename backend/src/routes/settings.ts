import express from 'express';
import auth from '../middleware/auth';
import optionalAuth from '../middleware/optionalAuth';
import {
  validateSettingsUpdate,
  handleValidationErrors,
} from '../validators/settingsValidator';
import { getSettings, updateSettings } from '../controllers/settingsController';

const router = express.Router();

router.get('/', optionalAuth, getSettings);
router.put('/', auth, validateSettingsUpdate, handleValidationErrors, updateSettings);

export default router;
