import { expect, test } from '@playwright/test';
import { STUB_TOKEN } from './searxng-stub/token.cjs';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('web search answer includes the stubbed SearXNG snippet', async ({ page, request }) => {
  const user = uniqueUser('web');
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  const webSearchBtn = page.getByRole('button', { name: /Веб-пошук/i });
  await expect(webSearchBtn).toBeVisible();
  await webSearchBtn.click();
  await expect(webSearchBtn.getByText('Увімк')).toBeVisible();

  const input = page.getByLabel('Введення повідомлення');
  await input.fill('E2E web search probe');
  await page.getByRole('button', { name: /Надіслати/i }).click();

  await expect(page.getByText(STUB_TOKEN).last()).toBeVisible({ timeout: 30_000 });
});
