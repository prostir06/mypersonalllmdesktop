import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import ProductTour from './ProductTour';
import { ProductTourProvider } from '../../context/ProductTourContext';

describe('ProductTour Component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div data-tour="test-target" style="width: 100px; height: 50px;">Target Element</div>
    `;
  });

  it('renders spotlight popover when tour is active', () => {
    const testSteps = [
      {
        id: 'test-step',
        target: '[data-tour="test-target"]',
        title: 'Тестовий крок',
        content: 'Опис тестового кроку',
        isNew: true,
      },
    ];

    render(
      <ProductTourProvider steps={testSteps}>
        <ProductTour autoStart={true} />
      </ProductTourProvider>
    );

    expect(screen.getByText('Тестовий крок')).toBeInTheDocument();
    expect(screen.getByText('Опис тестового кроку')).toBeInTheDocument();
    expect(screen.getByText(/Новинка/i)).toBeInTheDocument();
  });

  it('handles Next, Back, and Escape keys', () => {
    const testSteps = [
      { id: 's1', target: '[data-tour="test-target"]', title: 'Крок 1', content: 'Опис 1' },
      { id: 's2', target: '[data-tour="test-target"]', title: 'Крок 2', content: 'Опис 2' },
    ];

    render(
      <ProductTourProvider steps={testSteps}>
        <ProductTour autoStart={true} />
      </ProductTourProvider>
    );

    expect(screen.getByText('Крок 1')).toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: /Далі/i });
    fireEvent.click(nextBtn);

    expect(screen.getByText('Крок 2')).toBeInTheDocument();

    // Escape closes tour
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Крок 2')).not.toBeInTheDocument();
  });

  it('ignores Enter from an editable field and traps Tab in the dialog', () => {
    const testSteps = [
      { id: 's1', target: '[data-tour="test-target"]', title: 'Крок 1', content: 'Опис 1' },
      { id: 's2', target: '[data-tour="test-target"]', title: 'Крок 2', content: 'Опис 2' },
    ];

    render(
      <>
        <input aria-label="чернетка" />
        <ProductTourProvider steps={testSteps}>
          <ProductTour autoStart={true} />
        </ProductTourProvider>
      </>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const draft = screen.getByLabelText('чернетка');
    draft.focus();
    fireEvent.keyDown(draft, { key: 'Enter' });
    expect(screen.getByText('Крок 1')).toBeInTheDocument();

    const next = screen.getByRole('button', { name: /Далі/i });
    next.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Закрити тур' })).toHaveFocus();
  });
});
