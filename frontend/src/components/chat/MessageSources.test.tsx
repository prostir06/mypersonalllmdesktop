import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageSources } from './MessageSources';

describe('MessageSources', () => {
  it('renders filenames and rounded similarity percentages', () => {
    render(
      <MessageSources
        sources={[
          { filename: 'a.txt', similarity: 0.914 },
          { filename: 'b.md' },
        ]}
      />
    );

    expect(screen.getByText('Джерела')).toBeInTheDocument();
    expect(screen.getByText('a.txt (91%)')).toBeInTheDocument();
    expect(screen.getByText('b.md')).toBeInTheDocument();
  });

  it('shows sheet subtitle when present', () => {
    render(
      <MessageSources
        sources={[{ filename: 'book.xlsx', sheet: 'Sales', similarity: 0.5 }]}
      />
    );
    expect(screen.getByText('book.xlsx · Sales (50%)')).toBeInTheDocument();
  });

  it('renders nothing when sources are empty', () => {
    const { container } = render(<MessageSources sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
