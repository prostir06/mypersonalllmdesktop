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
});
