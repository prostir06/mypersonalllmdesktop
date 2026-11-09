import { expect, test } from '@playwright/test';
import { API_BASE_URL, loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('docx artifact opens on A4, keeps an edit, and downloads a .docx', async ({
  page,
  request,
}) => {
  const user = uniqueUser('docx');
  const token = await registerViaApi(request, user);

  const convRes = await request.post(`${API_BASE_URL}/api/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: 'Договір' },
  });
  expect(convRes.ok()).toBeTruthy();
  const conv = (await convRes.json()) as { id: number };

  const docxMarkdown = [
    'Текст договору:',
    '```docx',
    '# Договір поставки',
    '',
    'Постачальник передає товар.',
    '```',
  ].join('\n');

  await loginViaUi(page, user);
  await page.getByRole('list', { name: 'Список розмов' }).getByText('Договір').click();

  await page.route(`**/api/chat/history/${conv.id}*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [
          { id: 91001, role: 'user', content: 'Підготуй договір' },
          { id: 91002, role: 'assistant', content: docxMarkdown },
        ],
      }),
    });
  });

  await page.route('**/api/chat/stream', async (route) => {
    const sseBody = [
      `data: ${JSON.stringify({ type: 'init', conversationId: conv.id })}\n\n`,
      `data: ${JSON.stringify({ type: 'token', token: docxMarkdown })}\n\n`,
      `data: ${JSON.stringify({
        type: 'done',
        messageId: 91002,
        content: docxMarkdown,
      })}\n\n`,
    ].join('');
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      body: sseBody,
    });
  });

  await page.getByLabel('Введення повідомлення').fill('Підготуй договір');
  await page.getByRole('button', { name: /Надіслати/i }).click();

  await page.getByRole('button', { name: 'Переглянути артефакт: Договір поставки' }).click();
  await expect(page.getByTestId('artifact-panel')).toBeVisible();
  await expect(page.getByTestId('artifact-docx-sheet')).toContainText('Постачальник передає товар.');

  await page.getByRole('button', { name: 'Редагувати' }).click();
  const editor = page.getByTestId('artifact-editor-textarea');
  await editor.fill('# Договір поставки\n\nДодано пункт про строк оплати.');
  await page.getByRole('button', { name: 'Попередній перегляд' }).click();
  await expect(page.getByTestId('artifact-docx-sheet')).toContainText('Додано пункт про строк оплати.');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Завантажити документ у форматі Word (.docx)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/Договір_поставки\.docx$/);
});
