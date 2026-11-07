import { expect, test } from '@playwright/test';
import { CURRENT_TOUR_VERSION } from '../frontend/src/config/tourVersion';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('shows the product tour for the current version', async ({ page, request }) => {
  expect(CURRENT_TOUR_VERSION).toBe('v18.1');
  const user = uniqueUser('tour');
  await registerViaApi(request, user);
  await loginViaUi(page, user, { showTour: true });

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Пропустити' })).toBeVisible();
});
