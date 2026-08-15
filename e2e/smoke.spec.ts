import { test, expect } from '@playwright/test';
import { uniqueUser } from './test-helpers';

test('register and open dashboard chat', async ({ page }) => {
  const user = uniqueUser('smoke');

  await page.goto('/register');
  await page.getByPlaceholder('Олексій Коваленко').fill(user.name);
  await page.getByPlaceholder('name@example.com').fill(user.email);
  await page.getByPlaceholder('Мінімум 8 символів').fill(user.password);
  await page.getByRole('button', { name: /Зареєструватися|Register/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  const input = page.getByLabel('Введення повідомлення');
  await expect(input).toBeVisible();

  await input.fill('Hello e2e');
  await page.getByRole('button', { name: /Надіслати/i }).click();

  // User bubble should appear even if provider/stream fails in CI.
  await expect(page.getByText('Hello e2e')).toBeVisible({ timeout: 20_000 });
});
