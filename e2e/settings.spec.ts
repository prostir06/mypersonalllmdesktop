import { test, expect } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('settings system prompt save succeeds', async ({ page, request }) => {
  const user = uniqueUser('settings');

  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: /Налаштування AI/i })).toBeVisible({
    timeout: 15_000,
  });

  const prompt = page.locator('#system-prompt');
  await expect(prompt).toBeVisible();
  await prompt.fill('E2E system prompt baseline');

  await page.getByRole('button', { name: /Зберегти налаштування/i }).click();

  await expect(page.getByText('Налаштування збережено')).toBeVisible({ timeout: 15_000 });
});
