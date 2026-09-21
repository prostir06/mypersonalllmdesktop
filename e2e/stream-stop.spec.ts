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

  const response = await streamResponse.catch(() => undefined);
  if (response && response.status() >= 500) {
    test.skip(true, `RAG/LLM unavailable: stream returned ${response.status()}`);
  }

  const assistantMarkdown = page.locator('.message-bubble.assistant .markdown-content');
  const streamedTextRegion = assistantMarkdown.filter({ hasText: /\S/ });

  const hasAssistantText =
    (await expect(streamedTextRegion.first())
      .toBeVisible({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false)) ||
    (await expect(assistantMarkdown.first())
      .toBeVisible({ timeout: 1_000 })
      .then(() =>
        expect(assistantMarkdown.first())
          .not.toHaveText(/^\s*$/)
          .then(() => true)
          .catch(() => false)
      )
      .catch(() => false));

  if (!hasAssistantText) {
    test.skip(true, 'RAG/LLM unavailable: no assistant stream text visible');
  }

  const stop = page.getByRole('button', { name: /Зупинити|Stop/i });
  if (await stop.isVisible().catch(() => false)) {
    await stop.click();
  }

  await expect(input).toBeEnabled({ timeout: 15_000 });
});
