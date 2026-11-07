import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import logger from './logger';
import errorHandler from './middleware/errorHandler';
import requestId from './middleware/requestId';
import requestLogger from './middleware/requestLogger';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import modelsRoutes from './routes/models';
import settingsRoutes from './routes/settings';
import conversationsRoutes from './routes/conversations';
import usersRoutes from './routes/users';
import documentsRoutes from './routes/documents';
import promptsRoutes from './routes/prompts';
import systemRoutes from './routes/system';
import adminRoutes from './routes/admin';
import prisma from './config/prisma';
import type { RequestWithId } from './types/express';

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  compression({
    filter: (req: Request, res: Response) => {
      const path = req.path || '';
      const url = req.url || '';
      if (path === '/api/chat/stream' || url.startsWith('/api/chat/stream')) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(requestId);
app.use(requestLogger);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 200,
  message: { error: 'Too many authentication attempts, please try again later.' }
});

const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: 'Chat rate limit reached. Please slow down.' }
});

app.use('/api/', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/refresh', authLimiter);
app.use('/api/chat/send', chatLimiter);
app.use('/api/chat/stream', chatLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/models', modelsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/prompts', promptsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', async (_req: Request, res: Response) => {
  const startTime = process.hrtime.bigint();

  let dbStatus = 'ok';
  let dbLatencyMs: number | null = null;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
  } catch (err) {
    dbStatus = 'error';
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Health check DB ping failed: ${message}`);
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

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint not found',
    requestId: (req as RequestWithId).id,
  });
});

app.use(errorHandler);

export default app;
