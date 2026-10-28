import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MessageSources } from './MessageSources';

describe('MessageSources', () => {
  afterEach(() => {
    cleanup();
  });
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

  it('renders web search sources as external links with noopener', () => {
    const sources = [
      {
        id: 'web-0',
        document_id: 0,
        filename: 'Google Cloud Documentation',
        chunk_index: 0,
        snippet: 'Google Cloud Documentation',
        url: 'https://cloud.google.com/docs',
        score: 1.0,
        source_type: 'web_search',
      },
    ];
    render(<MessageSources sources={sources} />);
    const link = screen.getByRole('link', { name: /Google Cloud Documentation/i });
    expect(link).toHaveAttribute('href', 'https://cloud.google.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders web search sources without link if URL is not http/https', () => {
    const sources = [
      {
        id: 'web-1',
        document_id: 0,
        filename: 'Untrusted Source',
        chunk_index: 0,
        snippet: 'Untrusted Source',
        url: 'javascript:alert(1)',
        score: 1.0,
        source_type: 'web_search',
      },
    ];
    render(<MessageSources sources={sources} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/Untrusted Source/i)).toBeInTheDocument();
  });
});
