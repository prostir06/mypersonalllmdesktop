import { expect, test } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('upload txt document appears in list', async ({ page, request }) => {
  const user = uniqueUser('rag-upload');
  const fileName = `e2e-note-${Date.now()}.txt`;

  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.getByRole('button', { name: /Документи|RAG/i }).click();
  await page.locator('.modal input[type=file]').setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('E2E RAG keyword zebra-unique-42'),
  });

  await expect(page.getByText(fileName, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
