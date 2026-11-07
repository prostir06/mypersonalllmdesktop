import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { requestContext, type RequestLogContext } from './requestContext';

/** Prefer ./logs; if unwritable (Docker bind-mount as non-root), skip file transports. */
function resolveLogDir(): string | null {
  const dir = path.join(__dirname, '../logs');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return dir;
  } catch (err: unknown) {
    // If unwritable (e.g. read-only container), fallback to console transport
    if (process.env.NODE_ENV !== 'test') {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[logger] Unable to access log directory at ${dir}: ${msg}. Falling back to console-only logging.`
      );
    }
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

const rootLogger = winston.createLogger({
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
  winston.format.printf(({ level, message, timestamp, requestId }) => {
    const id = typeof requestId === 'string' && requestId ? ` requestId=${requestId}` : '';
    return `${timestamp} [${level}]: ${message}${id}`;
  })
);

// Dev always; production only when files are unavailable (e.g. EACCES on /app/logs).
if (process.env.NODE_ENV !== 'production' || transports.length === 0) {
  rootLogger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

const requestLoggers = new WeakMap<RequestLogContext, winston.Logger>();

function getRequestLogger(): winston.Logger {
  const store = requestContext.getStore();
  if (!store) return rootLogger;
  let child = requestLoggers.get(store);
  if (!child) {
    child = rootLogger.child({ requestId: store.requestId });
    requestLoggers.set(store, child);
  }
  return child;
}

const methodOverrides = new Map<PropertyKey, unknown>();

const logger: winston.Logger = new Proxy(rootLogger, {
  get(_target, prop) {
    if (methodOverrides.has(prop)) return methodOverrides.get(prop);
    const active = getRequestLogger();
    const value = Reflect.get(active, prop, active);
    return typeof value === 'function' ? value.bind(active) : value;
  },
  set(_target, prop, value) {
    methodOverrides.set(prop, value);
    return true;
  },
});

export default logger;
