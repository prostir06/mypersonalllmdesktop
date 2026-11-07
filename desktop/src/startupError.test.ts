import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { unavailableDialogMessage } from './startupError';

describe('unavailableDialogMessage', () => {
  it('includes the failure detail', () => {
    const text = unavailableDialogMessage(new Error('UI root missing'));
    assert.match(text, /Не вдалося відкрити інтерфейс/);
    assert.match(text, /UI root missing/);
  });
});
