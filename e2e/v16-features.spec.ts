import { expect, test } from '@playwright/test';
import { API_BASE_URL, loginViaUi, registerViaApi, uniqueUser } from './test-helpers';

test('v16 features: Claude encrypted key, pinned conversations, and interactive HTML artifact under CSP', async ({
  page,
  request,
}) => {
  const user = uniqueUser('v16');
  const token = await registerViaApi(request, user);

  // Create two conversations via API so conv1 is older and conv2 is newer
  const conv1Res = await request.post(`${API_BASE_URL}/api/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: 'Архітектура системи' },
  });
  expect(conv1Res.ok()).toBeTruthy();

  await new Promise((r) => setTimeout(r, 50));

  const conv2Res = await request.post(`${API_BASE_URL}/api/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: 'Щотижневий звіт' },
  });
  expect(conv2Res.ok()).toBeTruthy();
  const conv2 = (await conv2Res.json()) as { id: number };

  await loginViaUi(page, user);

  // 1. Settings: save encrypted Claude API key & set Anthropic as default provider
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: /Налаштування AI/i })).toBeVisible();

  await page.getByRole('tab', { name: /API Ключі/i }).click();
  const claudeInput = page.getByPlaceholder(/Введіть Claude API ключ/i);
  await expect(claudeInput).toBeVisible();
  await claudeInput.fill('sk-ant-api03-e2e-live-docker-key-987654');
  await page.getByRole('button', { name: /Зберегти ключ Claude/i }).click();
  await expect(page.getByText(/Claude API ключ збережено/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('tab', { name: /Загальні/i }).click();
  await page.locator('#provider-select').selectOption('anthropic');
  await page.getByRole('button', { name: /Зберегти налаштування/i }).click();
  await expect(page.getByText('Налаштування збережено')).toBeVisible({ timeout: 15_000 });

  // 2. Dashboard: pin the older conversation and verify pinned section persists across reload
  await page.goto('/dashboard');
  const olderCard = page.getByRole('option', { name: /Архітектура системи/i });
  await expect(olderCard).toBeVisible({ timeout: 15_000 });
  await olderCard.getByRole('button', { name: 'Закріпити' }).click();

  await expect(page.getByText(/📌 Закріплені/i)).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByText(/📌 Закріплені/i)).toBeVisible({ timeout: 15_000 });
  const options = page.getByRole('listbox', { name: 'Список розмов' }).getByRole('option');
  await expect(options.first()).toContainText('Архітектура системи');

  // 3. Interactive HTML Artifact + Token Telemetry via Anthropic stream
  const cspScriptErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy.*script-src/i.test(msg.text())) {
      cspScriptErrors.push(msg.text());
    }
  });

  const artifactMarkdown = [
    'Ось інтерактивний калькулятор:',
    '```html',
    '<h3>ROI Калькулятор</h3>',
    '<div id="calc-out">INIT</div>',
    '<script>document.getElementById("calc-out").textContent = "ROI: 142%";</script>',
    '```',
  ].join('\n');

  const usagePayload = {
    promptTokens: 500,
    completionTokens: 750,
    totalTokens: 1250,
    estimatedCostUsd: 0.0128,
  };

  // Select conv2 so activeConversation matches a real DB conversation
  await page.getByRole('option', { name: /Щотижневий звіт/i }).click();

  await page.route(`**/api/chat/history/${conv2.id}*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [
          { id: 88887, role: 'user', content: 'Побудуй ROI калькулятор' },
          {
            id: 88888,
            role: 'assistant',
            content: artifactMarkdown,
            token_usage: usagePayload,
          },
        ],
      }),
    });
  });

  await page.route('**/api/chat/stream', async (route) => {
    const postData = route.request().postDataJSON() as { provider?: string };
    expect(postData.provider).toBe('anthropic');
    const sseBody = [
      `data: ${JSON.stringify({ type: 'init', conversationId: conv2.id })}\n\n`,
      `data: ${JSON.stringify({ type: 'token', token: artifactMarkdown })}\n\n`,
      `event: token_usage\ndata: ${JSON.stringify(usagePayload)}\n\n`,
      `data: ${JSON.stringify({
        type: 'done',
        messageId: 88888,
        content: artifactMarkdown,
      })}\n\n`,
    ].join('');
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      body: sseBody,
    });
  });

  const composer = page.getByLabel('Введення повідомлення');
  await composer.fill('Побудуй ROI калькулятор');
  await page.getByRole('button', { name: /Надіслати/i }).click();

  // Verify token telemetry badge
  await expect(page.getByText(/1[\s,\u00a0.]?250 токенів/i)).toBeVisible({ timeout: 15_000 });

  // Open ArtifactPanel and verify inline <script> executed cleanly inside sandboxed iframe
  await page.getByRole('button', { name: /Переглянути артефакт: ROI Калькулятор/i }).click();
  await expect(page.getByTestId('artifact-panel')).toBeVisible();

  const artifactFrame = page.frameLocator('[data-testid="artifact-iframe"]');
  await expect(artifactFrame.locator('#calc-out')).toHaveText('ROI: 142%', { timeout: 10_000 });
  expect(cspScriptErrors).toEqual([]);
});
