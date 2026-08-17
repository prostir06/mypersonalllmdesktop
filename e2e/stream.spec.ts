import { test, expect } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('stream happy path accepts message and opens SSE stream', async ({
  page,
  request,
}) => {
  const user = uniqueUser('stream');

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

  await input.fill('E2E stream probe');
  await page.getByRole('button', { name: /Надіслати/i }).click();

  await expect(page.getByText('E2E stream probe')).toBeVisible({ timeout: 20_000 });

  const response = await streamResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type'] || '').toMatch(/text\/event-stream/i);
});
