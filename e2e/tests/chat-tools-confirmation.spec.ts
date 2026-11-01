import { expect, test } from '@playwright/test';
import { API_BASE_URL, loginViaUi, registerViaApi, uniqueUser } from '../test-helpers';

test.describe('Chat Tools, Web Search toggles & Confirmation flow (v18)', () => {
  test('toggles 🛠 Tools and 🌐 Web Search in ChatControls', async ({
    page,
    request,
  }) => {
    const user = uniqueUser('chat-toggles');
    await registerViaApi(request, user);
    await loginViaUi(page, user);

    await page.goto('/dashboard');
    await expect(page.getByLabel('Введення повідомлення')).toBeVisible({ timeout: 15_000 });

    // 1. Verify 🌐 Web Search toggle button
    const webSearchBtn = page.getByRole('button', { name: /Веб-пошук/i });
    await expect(webSearchBtn).toBeVisible();

    // Initially tools and web search are in their default state
    // Click web search toggle
    await webSearchBtn.click();
    await expect(webSearchBtn.getByText('Увімк')).toBeVisible();

    // Click again to turn off
    await webSearchBtn.click();
    await expect(webSearchBtn.getByText('Увімк')).not.toBeVisible();

    // 2. Verify 🛠 Tools toggle button
    const toolsBtn = page.getByRole('button', { name: /Інструменти/i });
    await expect(toolsBtn).toBeVisible();

    // Tools is enabled by default in settings; clicking toggles it
    const hasActiveBadge = await toolsBtn.getByText('Увімк').isVisible().catch(() => false);
    await toolsBtn.click();
    if (hasActiveBadge) {
      await expect(toolsBtn.getByText('Увімк')).not.toBeVisible();
    } else {
      await expect(toolsBtn.getByText('Увімк')).toBeVisible();
    }
  });

  test('renders ToolCallCard with collapsible trace details', async ({
    page,
    request,
  }) => {
    const user = uniqueUser('tool-trace');
    const token = await registerViaApi(request, user);

    const convRes = await request.post(`${API_BASE_URL}/api/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: 'Тест виклику інструментів' },
    });
    expect(convRes.ok()).toBeTruthy();
    const conv = (await convRes.json()) as { id: number };

    await loginViaUi(page, user);
    await page.goto('/dashboard');

    const readTrace = {
      tool: 'web_search',
      args: { query: 'курс долара НБУ' },
      category: 'read',
      status: 'completed',
      durationMs: 185,
      summary: 'Знайдено 3 веб-результати за запитом "курс долара НБУ"',
      result: { query: 'курс долара НБУ', count: 3 },
    };

    // Route intercept history to supply message with tool_trace
    await page.route(`**/api/chat/history/${conv.id}*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messages: [
            { id: 99101, role: 'user', content: 'Який курс долара?' },
            {
              id: 99102,
              role: 'assistant',
              content: 'Ось актуальний курс долара за даними веб-пошуку.',
              tool_trace: [readTrace],
            },
          ],
        }),
      });
    });

    // Select the conversation
    await page.getByRole('option', { name: /Тест виклику інструментів/i }).click();

    // Check ToolCallCard rendering
    const toolCard = page.locator('.tool-trace-container');
    await expect(toolCard).toBeVisible({ timeout: 15_000 });
    await expect(toolCard.getByText('Веб-пошук')).toBeVisible();
    await expect(toolCard.getByText('Виконано')).toBeVisible();
    await expect(toolCard.getByText('(185 мс)')).toBeVisible();

    // Test expand/collapse of trace details
    const detailsBtn = toolCard.getByRole('button', { name: /Деталі ▼/i });
    await expect(detailsBtn).toBeVisible();
    await detailsBtn.click();

    await expect(toolCard.getByText('Аргументи:')).toBeVisible();
    await expect(toolCard.getByText('курс долара НБУ')).toBeVisible();

    const collapseBtn = toolCard.getByRole('button', { name: /Згорнути ▲/i });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await expect(toolCard.getByText('Аргументи:')).not.toBeVisible();
  });

  test('renders ConfirmActionCard and processes approve and reject actions', async ({
    page,
    request,
  }) => {
    const user = uniqueUser('confirm-card');
    const token = await registerViaApi(request, user);

    const convRes = await request.post(`${API_BASE_URL}/api/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: 'Тест підтвердження дій' },
    });
    expect(convRes.ok()).toBeTruthy();
    const conv = (await convRes.json()) as { id: number };

    await loginViaUi(page, user);
    await page.goto('/dashboard');

    const writeTrace1 = {
      tool: 'update_settings',
      args: { temperature: 0.3 },
      category: 'write',
      requiresConfirmation: true,
      pendingActionId: 'action-approve-1',
      status: 'pending_confirmation',
      title: 'Оновити налаштування',
      summary: 'Оновити налаштування: змінити температуру на 0.3',
      diff: {
        temperature: { from: 0.7, to: 0.3 },
      },
    };

    const writeTrace2 = {
      tool: 'add_user_memory_note',
      args: { content: 'Користувач віддає перевагу TypeScript' },
      category: 'write',
      requiresConfirmation: true,
      pendingActionId: 'action-reject-2',
      status: 'pending_confirmation',
      title: 'Додати довготривалу нотатку',
      summary: 'Зберегти в пам’ять: "Користувач віддає перевагу TypeScript"',
    };

    await page.route(`**/api/chat/history/${conv.id}*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messages: [
            { id: 99201, role: 'user', content: 'Онови температуру та додай нотатку' },
            {
              id: 99202,
              role: 'assistant',
              content: 'Я підготував зміни, підтвердіть або відхиліть їх:',
              tool_trace: [writeTrace1, writeTrace2],
            },
          ],
        }),
      });
    });

    let approvedCalled = false;
    await page.route('**/api/chat/tool-actions/action-approve-1/approve', async (route) => {
      approvedCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'approved',
          resultSummary: 'Температуру успішно змінено на 0.3',
        }),
      });
    });

    let rejectedCalled = false;
    await page.route('**/api/chat/tool-actions/action-reject-2/reject', async (route) => {
      rejectedCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'rejected',
        }),
      });
    });

    // Select the conversation
    await page.getByRole('option', { name: /Тест підтвердження дій/i }).click();

    // Verify both confirmation cards are rendered
    await expect(page.getByText('Оновити налаштування')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Додати довготривалу нотатку')).toBeVisible();
    await expect(page.getByText('temperature')).toBeVisible();
    await expect(page.getByText('0.7')).toBeVisible();
    await expect(page.getByText('0.3')).toBeVisible();

    // Click "Підтвердити" on the first action card
    const firstCard = page.locator('.card', { hasText: 'Оновити налаштування' });
    const approveBtn = firstCard.getByRole('button', { name: /Підтвердити/i });
    await approveBtn.click();

    await expect(firstCard.getByText('Дію підтверджено')).toBeVisible({ timeout: 10_000 });
    expect(approvedCalled).toBe(true);

    // Click "Відхилити" on the second action card
    const secondCard = page.locator('.card', { hasText: 'Додати довготривалу нотатку' });
    const rejectBtn = secondCard.getByRole('button', { name: /Відхилити/i });
    await rejectBtn.click();

    await expect(secondCard.getByText('Дію відхилено')).toBeVisible({ timeout: 10_000 });
    expect(rejectedCalled).toBe(true);
  });
});
