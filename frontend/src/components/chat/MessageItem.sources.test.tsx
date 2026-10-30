import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import MessageItem from './MessageItem';

describe('MessageItem sources and tokens', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders MessageSources when assistant message has persisted sources', () => {
    render(
      <MessageItem
        msg={{
          role: 'assistant',
          content: 'Answer with RAG',
          sources: [{ filename: 'notes.txt', similarity: 0.88 }],
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );

    expect(screen.getByText('Джерела')).toBeInTheDocument();
    expect(screen.getByText('notes.txt (88%)')).toBeInTheDocument();
  });

  it('renders token usage badge under assistant message with count and cost (< $0.01)', () => {
    render(
      <MessageItem
        msg={{
          role: 'assistant',
          content: 'Here is the response',
          tokenUsage: {
            promptTokens: 1200,
            completionTokens: 450,
            totalTokens: 1650,
            estimatedCostUsd: 0.0034,
          },
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );

    expect(screen.getByText(/токенів/)).toBeInTheDocument();
    expect(screen.getByText(/~\$0\.0034/)).toBeInTheDocument();

    const badge = screen.getByTitle('Вхідні: 1200 | Вихідні: 450');
    expect(badge).toBeInTheDocument();
  });

  it('renders token usage cost with 3 decimals when cost >= $0.01', () => {
    render(
      <MessageItem
        msg={{
          role: 'assistant',
          content: 'Large prompt response',
          tokenUsage: {
            promptTokens: 5000,
            completionTokens: 2000,
            totalTokens: 7000,
            estimatedCostUsd: 0.0456,
          },
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );

    expect(screen.getByText(/~\$0\.046/)).toBeInTheDocument();
  });

  it('hides token badge when llm_assistant_show_tokens is false in localStorage', () => {
    localStorage.setItem('llm_assistant_show_tokens', 'false');

    render(
      <MessageItem
        msg={{
          role: 'assistant',
          content: 'Response with hidden tokens',
          tokenUsage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            estimatedCostUsd: 0.0005,
          },
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );

    expect(screen.queryByText(/токенів/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Вхідні:/)).not.toBeInTheDocument();
  });

  it('does not render token badge for user message even if tokenUsage is present', () => {
    render(
      <MessageItem
        msg={{
          role: 'user',
          content: 'User query',
          tokenUsage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );

    expect(screen.queryByText(/токенів/)).not.toBeInTheDocument();
  });
});
