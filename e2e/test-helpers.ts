import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { CURRENT_TOUR_VERSION, TOUR_STORAGE_KEY } from '../frontend/src/config/tourVersion';

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

  const login = await request.post(`${API_BASE_URL}/api/auth/login`, {
    data: { email: user.email, password: user.password },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const body = (await login.json()) as { token?: string };
  expect(body.token).toBeTruthy();
  return body.token!;
}

export async function dismissTourIfOpen(page: Page): Promise<void> {
  try {
    const dismissBtn = page.getByRole('button', { name: /Пропустити|Закрити тур/i });
    if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissBtn.click({ force: true }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

export async function loginViaUi(
  page: Page,
  user: TestUser,
  opts?: { showTour?: boolean }
): Promise<void> {
  if (!opts?.showTour) {
    await page.addInitScript(
      ({ key, version }) => {
        try {
          localStorage.setItem(key, version);
        } catch {
          /* private mode */
        }
      },
      { key: TOUR_STORAGE_KEY, version: CURRENT_TOUR_VERSION }
    );
  }
  await page.goto('/login');
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  try {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    await dismissTourIfOpen(page);
  } catch (err) {
    const alertText = await page
      .getByRole('alert')
      .textContent()
      .catch(() => null);
    throw new Error(
      `loginViaUi failed for ${user.email}; still at ${page.url()}` +
        (alertText ? `; alert: ${alertText}` : ''),
      { cause: err }
    );
  }
}
