import fs from 'fs';
import path from 'path';
import winston from 'winston';

/** Prefer ./logs; if unwritable (Docker bind-mount as non-root), skip file transports. */
function resolveLogDir(): string | null {
  const dir = path.join(__dirname, '../logs');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return dir;
  } catch {
    return null;
  }
}

const logDir = resolveLogDir();
const transports: winston.transport[] = [];

if (logDir) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'llm-backend' },
  transports,
});

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Dev always; production only when files are unavailable (e.g. EACCES on /app/logs).
if (process.env.NODE_ENV !== 'production' || transports.length === 0) {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

export default logger;
