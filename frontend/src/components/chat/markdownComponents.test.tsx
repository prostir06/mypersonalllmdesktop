import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { markdownComponents } from './markdownComponents';

describe('markdownComponents.a', () => {
  it('opens https links in a new tab with noopener', () => {
    const A = markdownComponents.a!;
    render(<A href="https://example.com">docs</A>);
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not link javascript urls', () => {
    const A = markdownComponents.a!;
    render(<A href="javascript:alert(1)">x</A>);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
