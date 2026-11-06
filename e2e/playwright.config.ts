import { existsSync } from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

const channel =
  process.env.E2E_BROWSER_CHANNEL ||
  (!process.env.CI && !existsSync(chromium.executablePath()) ? 'chrome' : undefined);

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  // Serialize: shared Docker IP hits authLimiter when many workers register/login.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    channel,
    trace: 'on-first-retry',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: process.env.E2E_BASE_URL || 'http://localhost:3000',
          localStorage: [
            {
              name: 'product_tour_completed_version',
              value: 'v18.1',
            },
          ],
        },
      ],
    },
  },
});
