import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('login page has no serious accessibility violations', async ({ page }) => {
  await page.goto('/login');
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
