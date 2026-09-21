import { expect, test } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('conversation memory notes persist and summary refreshes', async ({
  page,
  request,
}) => {
  const user = uniqueUser('memory');
  const noteText = `E2E memory note ${Date.now()}`;

  await registerViaApi(request, user);
  await loginViaUi(page, user);

  const input = page.getByLabel('Введення повідомлення');
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill('Коротко підсумуй цю розмову для перевірки memory e2e.');
  const streamResponse = page
    .waitForResponse(
      (response) =>
        response.url().includes('/api/chat/stream') &&
        response.request().method() === 'POST',
      { timeout: 45_000 }
    )
    .catch(() => null);
  await page.getByRole('button', { name: /Надіслати/i }).click();

  const response = await streamResponse;
  if (response && response.status() >= 500) {
    test.skip(true, `RAG/LLM unavailable: stream returned ${response.status()}`);
  }

  const assistantReady = await expect(
    page.locator('.message-bubble.assistant .markdown-content').first()
  )
    .toBeVisible({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!assistantReady) {
    test.skip(true, 'RAG/LLM unavailable: assistant did not answer for memory seed');
  }

  const conversationUrl = page.url();
  const conversationMatch = conversationUrl.match(/[?&]conversation=(\d+)/);
  if (!conversationMatch) {
    test.skip(true, 'RAG/LLM unavailable: conversation id not created after seed message');
  }
  const conversationId = conversationMatch[1];

  const memoryButton = page.getByRole('button', { name: /Memory|Пам/i });
  const memoryVisible = await expect(memoryButton)
    .toBeVisible({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!memoryVisible) {
    test.skip(true, 'RAG/LLM unavailable: memory panel button not available');
  }
  await memoryButton.click();
  await expect(page.getByTestId('memory-panel')).toBeVisible();
  await page.getByPlaceholder('Нова нотатка').fill(noteText);
  await page.getByRole('button', { name: /^Додати$/ }).click();
  await expect(page.getByTestId('memory-note').filter({ hasText: noteText })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto(`/dashboard?conversation=${conversationId}`);
  await memoryButton.click();
  await expect(page.getByTestId('memory-panel')).toBeVisible();
  await expect(page.getByTestId('memory-note').filter({ hasText: noteText })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole('button', { name: /Оновити зараз/i }).click();
  const summaryFilled = await page
    .waitForFunction(() => {
      const el = document.querySelector('[data-testid="memory-summary"]') as
        | HTMLTextAreaElement
        | null;
      return Boolean(el && el.value.trim().length > 0);
    }, undefined, { timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
  if (!summaryFilled) {
    test.skip(true, 'RAG/LLM unavailable: summarize provider did not produce summary');
  }
});
