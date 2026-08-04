// Routes/controllers are TypeScript — register before any require('./routes/*')
require('ts-node/register');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./logger');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security & Performance Middlewares
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 attempts per 15 minutes for auth endpoints
  message: { error: 'Too many authentication attempts, please try again later.' }
});

const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30, // 30 messages per minute
  message: { error: 'Chat rate limit reached. Please slow down.' }
});

app.use('/api/', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/chat/send', chatLimiter);
app.use('/api/chat/stream', chatLimiter);

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/models', require('./routes/models'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/users', require('./routes/users'));
app.use('/api/documents', require('./routes/documents'));

// Health check endpoint — DB ping via Prisma (same DATABASE_URL as app)
app.get('/api/health', async (req, res) => {
  const prisma = require('./config/prisma').default || require('./config/prisma');
  const startTime = process.hrtime.bigint();

  let dbStatus = 'ok';
  let dbLatencyMs = null;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
  } catch (err) {
    dbStatus = 'error';
    logger.warn(`Health check DB ping failed: ${err.message}`);
  }

  const memoryMb = process.memoryUsage();
  const uptimeSeconds = process.uptime();

  const responseTimeMs = Number(process.hrtime.bigint() - startTime) / 1e6;

  const health = {
    status: dbStatus === 'ok' ? 'OK' : 'DEGRADED',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptimeSeconds),
      human: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`
    },
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs
    },
    memory: {
      heapUsedMb: Math.round(memoryMb.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memoryMb.heapTotal / 1024 / 1024),
      rssMb: Math.round(memoryMb.rss / 1024 / 1024)
    },
    responseTimeMs: Math.round(responseTimeMs * 100) / 100
  };

  res.status(dbStatus === 'ok' ? 200 : 503).json(health);
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

module.exports = app;
