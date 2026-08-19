import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

const xlsxMime =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test('upload xlsx document appears in list', async ({ page, request }) => {
  const user = uniqueUser('rag-xlsx');
  const fileName = `e2e-sheet-${Date.now()}.xlsx`;
  const buffer = readFileSync(join(__dirname, 'fixtures', 'tiny.xlsx'));

  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.getByRole('button', { name: /Документи|RAG/i }).click();
  await page.locator('.modal input[type=file]').setInputFiles({
    name: fileName,
    mimeType: xlsxMime,
    buffer,
  });

  await expect(page.getByText(fileName, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
