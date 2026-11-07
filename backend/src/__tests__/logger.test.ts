/**
 * Logger must not crash process when ./logs is unwritable (Docker bind-mount + non-root).
 */
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    mkdirSync: jest.fn(() => {
      const err = new Error('permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    }),
    accessSync: jest.fn(() => {
      const err = new Error('permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    }),
  };
});

import logger from '../logger';
import { requestContext } from '../requestContext';

describe('logger', () => {
  it('boots with console fallback when log directory is not writable', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const logger = require('../logger').default as {
        info: (msg: string) => void;
      };
      expect(() => logger.info('boot ok')).not.toThrow();
    });
  });

  it('warns to console when not in test env and log dir is unwritable', () => {
    const origEnv = process.env.NODE_ENV;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      process.env.NODE_ENV = 'production';
      jest.isolateModules(() => {
        require('../logger');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\[logger\] Unable to access log directory/)
        );
      });
    } finally {
      process.env.NODE_ENV = origEnv;
      warnSpy.mockRestore();
    }
  });

  it('keeps the request id on logs made during that request', () => {
    const entries: Array<{ message?: unknown; requestId?: unknown }> = [];
    const onData = (info: { message?: unknown; requestId?: unknown }) => entries.push(info);
    logger.on('data', onData);
    try {
      requestContext.run({ requestId: 'req-42' }, () => {
        logger.info('during request');
      });
    } finally {
      logger.off('data', onData);
    }
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'during request', requestId: 'req-42' }),
      ])
    );
  });
});
