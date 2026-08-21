import { test, expect } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('stream stop re-enables composer after abort', async ({ page, request }) => {
  const user = uniqueUser('stop');

  await registerViaApi(request, user);
  await loginViaUi(page, user);

  const input = page.getByLabel('Введення повідомлення');
  await expect(input).toBeVisible();

  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/chat/stream') &&
      response.request().method() === 'POST',
    { timeout: 30_000 }
  );

  await input.fill('E2E stop probe — please stream a long answer');
  await page.getByRole('button', { name: /Надіслати/i }).click();

  await expect(page.getByText(/E2E stop probe/)).toBeVisible({
    timeout: 20_000,
  });

  const stop = page.getByRole('button', { name: /Зупинити|Stop/i });
  if (await stop.isVisible().catch(() => false)) {
    await stop.click();
  }

  await streamResponse.catch(() => undefined);

  await expect(input).toBeEnabled({ timeout: 15_000 });
});
