import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('upload xlsx document appears in list', async ({ page, request }) => {
  const user = uniqueUser('rag-xlsx');
  const fixturePath = join(__dirname, 'fixtures', 'tiny.xlsx');
  const fileName = 'tiny.xlsx';

  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.getByRole('button', { name: /Документи|RAG/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/documents/upload') &&
      response.request().method() === 'POST',
    { timeout: 30_000 }
  );

  // Real path: Playwright buffer+custom name uploads were not reaching the API here.
  await page.locator('.modal input[type=file]').setInputFiles(fixturePath);

  const response = await uploadResponse;
  expect(response.ok(), await response.text()).toBeTruthy();

  const docCheckbox = page.getByRole('checkbox', { name: fileName, exact: true });
  await expect(docCheckbox).toBeVisible({ timeout: 30_000 });
});
