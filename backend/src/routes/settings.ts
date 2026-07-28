import express from 'express';
import auth from '../middleware/auth';
import {
  validateSettingsUpdate,
  handleValidationErrors,
} from '../validators/settingsValidator';
import { getSettings, updateSettings } from '../controllers/settingsController';

const router = express.Router();

router.get('/', getSettings);
router.put('/', auth, validateSettingsUpdate, handleValidationErrors, updateSettings);

export = router;
