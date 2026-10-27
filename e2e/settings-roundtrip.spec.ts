import { expect, test } from '@playwright/test';
import { loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('settings round-trip persists system prompt and temperature', async ({
  page,
  request,
}) => {
  const user = uniqueUser('settings-roundtrip');
  const promptValue = `E2E roundtrip prompt ${Date.now()}`;
  const temperatureValue = '1.15';

  await registerViaApi(request, user);
  await loginViaUi(page, user);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: /Налаштування AI/i })).toBeVisible({
    timeout: 20_000,
  });

  const prompt = page.locator('#system-prompt');
  await expect(prompt).toBeVisible();
  await prompt.fill(promptValue);

  const temperature = page.locator('#temperature-input');
  await expect(temperature).toBeVisible();
  await temperature.fill(temperatureValue);
  await expect(temperature).toHaveValue(temperatureValue);

  await page.getByRole('button', { name: /Зберегти налаштування/i }).click();
  await expect(page.getByText('Налаштування збережено')).toBeVisible({ timeout: 15_000 });

  await page.goto('/settings');
  await expect(prompt).toHaveValue(promptValue, { timeout: 15_000 });
  await expect(temperature).toHaveValue(temperatureValue);
});
