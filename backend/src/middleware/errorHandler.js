// backend/src/middleware/errorHandler.js - НОВИЙ ФАЙЛ
const logger = require('../logger');

const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    requestId: req.id,
    timestamp: new Date().toISOString()
  });

  // Не розкривайте деталі помилки у production
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : err.message;

  res.status(statusCode).json({
    error: message,
    requestId: req.id,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

module.exports = errorHandler;
