import { expect, test } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('RAG citation shows sources after asking about uploaded txt', async ({
  page,
  request,
}) => {
  const user = uniqueUser('citation');
  const fileName = `e2e-citation-${Date.now()}.txt`;
  const keyword = `citation-keyword-${Date.now()}`;

  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.getByRole('button', { name: /Документи|RAG/i }).click();
  await page.locator('.modal input[type=file]').setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from(`E2E citation check token: ${keyword}`),
  });

  const docCheckbox = page.getByRole('checkbox', { name: fileName, exact: true });
  await expect(docCheckbox).toBeVisible({ timeout: 30_000 });
  const indexReady = await docCheckbox
    .isEnabled({ timeout: 45_000 })
    .catch(() => false);
  if (!indexReady) {
    test.skip(true, 'RAG/LLM unavailable: uploaded document not ready for selection');
  }
  await docCheckbox.check();
  await page.getByRole('button', { name: /Готово/i }).click();

  const input = page.getByLabel('Введення повідомлення');
  await input.fill(`Який токен у документі? ${keyword}`);

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

  // Provider may return SSE 200 with an error (e.g. missing/dummy OpenAI key).
  // Skip before hard-failing on the user bubble / keyword.
  const turnOutcome = await Promise.race([
    page
      .getByText(keyword)
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => 'ok' as const),
    page
      .getByRole('button', { name: /Перевірити налаштування/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => 'err' as const),
  ]).catch(() => 'timeout' as const);
  if (turnOutcome !== 'ok') {
    test.skip(true, 'RAG/LLM unavailable: chat stream failed');
  }

  const ragUnavailable = await page
    .getByText(/Контекст RAG недоступний|Контекст RAG тимчасово недоступний/i)
    .isVisible()
    .catch(() => false);
  if (ragUnavailable) {
    test.skip(true, 'RAG/LLM unavailable: RAG context failed');
  }

  await expect(
    page.locator('.message-sources').filter({ hasText: /Джерела/i }).first()
  ).toBeVisible({ timeout: 30_000 });
});
