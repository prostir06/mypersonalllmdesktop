import { expect, test } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('user memory note persists across settings reloads', async ({
  page,
  request,
}) => {
  const user = uniqueUser('user-memory');
  const noteText = `E2E user memory ${Date.now()}`;

  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.goto('/settings');
  await expect(page.getByTestId('user-memory-card')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId('user-memory-input').fill(noteText);
  await page.getByRole('button', { name: /^Додати$/ }).click();
  await expect(
    page.getByTestId('user-memory-note').filter({ hasText: noteText })
  ).toBeVisible({ timeout: 15_000 });

  // Full reload proves persistence (and keeps auth cookie/localStorage path).
  await page.reload();
  await expect(page.getByTestId('user-memory-card')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByTestId('user-memory-note').filter({ hasText: noteText })
  ).toBeVisible({ timeout: 15_000 });

  // Navigate away and back via SPA links (cross-conversation surface).
  await page.getByRole('link', { name: /Чат|Dashboard|💬/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await page.getByRole('link', { name: /Налаштування/i }).click();
  await expect(page).toHaveURL(/\/settings/, { timeout: 15_000 });
  await expect(
    page.getByTestId('user-memory-note').filter({ hasText: noteText })
  ).toBeVisible({ timeout: 15_000 });
});
