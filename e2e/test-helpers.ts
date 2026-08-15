import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

export const API_BASE_URL = process.env.E2E_API_URL || 'http://localhost:5000';

export type TestUser = {
  email: string;
  password: string;
  name: string;
};

export function uniqueUser(prefix: string): TestUser {
  return {
    email: `e2e-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
    password: 'TestPass1',
    name: `${prefix} E2E`,
  };
}

export async function registerViaApi(
  request: APIRequestContext,
  user: TestUser
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/auth/register`, {
    data: user,
  });

  if (response.status() === 403) {
    test.skip(true, 'Registration is disabled in this environment');
  }

  expect(response, await response.text()).toBeOK();
  const body = (await response.json()) as { token?: string };
  expect(body.token).toBeTruthy();
  return body.token!;
}

export async function loginViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('name@example.com').fill(user.email);
  await page.getByPlaceholder('••••••••').fill(user.password);
  await page.getByRole('button', { name: /Увійти|Login/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}
