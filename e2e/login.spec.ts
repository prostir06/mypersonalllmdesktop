import { test } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('login existing user reaches dashboard', async ({ page, request }) => {
  const user = uniqueUser('login');

  await registerViaApi(request, user);
  await loginViaUi(page, user);
});
