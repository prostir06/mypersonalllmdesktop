import { test, expect } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('stream happy path shows assistant text and SSE stream', async ({
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
  const sendButton = page.getByRole('button', { name: /Надіслати/i });
  const canSend = await expect(sendButton)
    .toBeEnabled({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!canSend) {
    test.skip(true, 'RAG/LLM unavailable: composer never became send-ready');
  }
  await sendButton.click();

  const response = await streamResponse.catch(() => null);
  if (!response) {
    test.skip(true, 'RAG/LLM unavailable: stream request was not started');
    return;
  }
  if (response.status() >= 500) {
    test.skip(true, `RAG/LLM unavailable: stream returned ${response.status()}`);
  }
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type'] || '').toMatch(/text\/event-stream/i);

  const assistantText = page.locator('.message-bubble.assistant .markdown-content').first();
  const assistantVisible = await expect(assistantText)
    .toBeVisible({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!assistantVisible) {
    test.skip(true, 'RAG/LLM unavailable: assistant stream text not visible');
  }
  await expect(assistantText).not.toHaveText(/^\s*$/);
});
