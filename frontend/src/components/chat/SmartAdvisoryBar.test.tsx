import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SmartAdvisoryBar from './SmartAdvisoryBar';
import type { AdvisoryTip } from '../../types/api';

const mockAdvisories: AdvisoryTip[] = [
  {
    id: 'info_tip_1',
    severity: 'info',
    category: 'providers',
    title: 'Підказка про модель',
    message: 'Спробуйте нову модель Gemini.',
    actionLabel: 'Переглянути',
    actionType: 'navigate_settings',
  },
  {
    id: 'warning_tip_1',
    severity: 'warning',
    category: 'rag',
    title: 'Попередження RAG',
    message: 'Документи не індексовані.',
    actionLabel: 'Виправити',
    actionType: 'open_documents',
  },
];

describe('SmartAdvisoryBar', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it('renders at most 1 chip and prioritizes warning over info', () => {
    render(
      <SmartAdvisoryBar
        advisories={mockAdvisories}
        versionHash="v123"
        onAction={vi.fn()}
      />
    );

    // Warning should be displayed first
    expect(screen.getByText('Попередження RAG')).toBeInTheDocument();
    expect(screen.getByText(/Документи не індексовані/i)).toBeInTheDocument();
    expect(screen.queryByText('Підказка про модель')).not.toBeInTheDocument();
  });

  it('triggers onAction callback when action button is clicked', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <SmartAdvisoryBar
        advisories={mockAdvisories}
        versionHash="v123"
        onAction={onAction}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Виправити' }));
    expect(onAction).toHaveBeenCalledWith(mockAdvisories[1]);
  });

  it('dismisses tip, writes to sessionStorage, and falls back to next non-dismissed tip', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <SmartAdvisoryBar
        advisories={mockAdvisories}
        versionHash="v123"
        onAction={vi.fn()}
      />
    );

    // Click dismiss button
    const closeBtn = screen.getByRole('button', { name: /Приховати пораду/i });
    await user.click(closeBtn);

    expect(
      sessionStorage.getItem('smart_advisory_dismissed:warning_tip_1:v123')
    ).toBe('true');

    // Next tip (info) should now be displayed
    expect(screen.queryByText('Попередження RAG')).not.toBeInTheDocument();
    expect(screen.getByText('Підказка про модель')).toBeInTheDocument();

    // Dismiss info tip too
    const closeBtn2 = screen.getByRole('button', { name: /Приховати пораду/i });
    await user.click(closeBtn2);

    expect(
      sessionStorage.getItem('smart_advisory_dismissed:info_tip_1:v123')
    ).toBe('true');

    // Nothing displayed
    expect(screen.queryByText('Підказка про модель')).not.toBeInTheDocument();

    // Re-rendering with same versionHash should show nothing
    rerender(
      <SmartAdvisoryBar
        advisories={mockAdvisories}
        versionHash="v123"
        onAction={vi.fn()}
      />
    );
    expect(screen.queryByText('Попередження RAG')).not.toBeInTheDocument();
  });

  it('renders nothing if advisories array is empty', () => {
    const { container } = render(
      <SmartAdvisoryBar advisories={[]} versionHash="v123" onAction={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});
