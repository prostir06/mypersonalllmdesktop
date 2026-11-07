/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.[jt]s', '**/?(*.)+(spec|test).[jt]s'],
  testPathIgnorePatterns: ['/node_modules/', '/src/__tests__/integration/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/generated/**',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      lines: 80,
      functions: 80,
      branches: 60,
    },
  },
};
