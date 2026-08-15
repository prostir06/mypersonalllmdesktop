import { expect, test } from '@playwright/test';
import {
  API_BASE_URL,
  loginViaUi,
  registerViaApi,
  uniqueUser,
} from './test-helpers';

test('conversation query parameter selects conversation', async ({ page, request }) => {
  const user = uniqueUser('conversation-query');
  const title = `E2E Query Conversation ${Date.now()}`;

  const token = await registerViaApi(request, user);
  const response = await request.post(`${API_BASE_URL}/api/conversations`, {
    data: { title },
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(response, await response.text()).toBeOK();
  const conversation = (await response.json()) as { id: number };

  await loginViaUi(page, user);
  await page.goto(`/dashboard?conversation=${conversation.id}`);

  const conversations = page.getByRole('listbox', { name: 'Список розмов' });
  const selectedConversation = conversations.getByRole('option', {
    selected: true,
  });
  await expect(selectedConversation).toContainText(title, { timeout: 20_000 });
  await expect(page.getByLabel('Введення повідомлення')).toBeVisible();
});
