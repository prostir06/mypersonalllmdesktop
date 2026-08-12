import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmModal from './ConfirmModal';

describe('ConfirmModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('calls onConfirm when user clicks confirm', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        show={true}
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Так' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when user clicks cancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        show={true}
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
