import { expect, test } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('refresh keeps the session and logout returns to login', async ({ page, request }) => {
  const user = uniqueUser('session');
  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByLabel('Введення повідомлення')).toBeVisible();

  await page.getByRole('button', { name: 'Вийти' }).click();
  await expect(page).toHaveURL(/\/login/);
});
