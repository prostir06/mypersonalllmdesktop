import express from 'express';
import { body } from 'express-validator';
import { login, refresh, register } from '../controllers/authController';

const router = express.Router();

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Невалідна email адреса'),
    body('name')
      .trim()
      .notEmpty()
      .isLength({ min: 2, max: 255 })
      .withMessage("Ім'я має бути від 2 до 255 символів"),
    body('password')
      .isLength({ min: 8 })
      .matches(/[A-Z]/)
      .matches(/[0-9]/)
      .withMessage('Пароль: мін. 8 символів, одна велика літера та одна цифра'),
  ],
  register
);

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Невалідна email адреса'),
    body('password').notEmpty().withMessage("Пароль є обов'язковим"),
  ],
  login
);

router.post('/refresh', refresh);

export default router;
module.exports = router;
