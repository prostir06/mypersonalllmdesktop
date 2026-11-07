import { expect, test } from '@playwright/test';
import { API_BASE_URL, loginViaUi } from './test-helpers';

const admin = {
  email: 'e2e-admin@test.local',
  password: 'TestPass1',
  name: 'E2E Admin',
};

test('admin sees the shared-key spend tables', async ({ page, request }) => {
  const registered = await request.post(`${API_BASE_URL}/api/auth/register`, { data: admin });
  if (!registered.ok() && registered.status() !== 409 && registered.status() !== 400) {
    expect(registered.ok(), await registered.text()).toBeTruthy();
  }

  await loginViaUi(page, admin);
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Команда' }).click();
  await expect(page.getByText('Витрата сьогодні (оцінка)')).toBeVisible();
  await expect(page.getByText('Витрата цього місяця (оцінка)')).toBeVisible();
});
