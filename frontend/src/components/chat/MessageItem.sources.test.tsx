import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('renders token badge if token_usage is provided via snake_case', () => {
    render(
      <MessageItem
        msg={{
          role: 'assistant',
          content: 'Response with snake_case token_usage',
          token_usage: {
            promptTokens: 120,
            completionTokens: 80,
            totalTokens: 200,
            estimatedCostUsd: 0.0003,
          },
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );

    expect(screen.getByText(/200 токенів/)).toBeInTheDocument();
    expect(screen.getByText(/~\$0\.0003/)).toBeInTheDocument();
  });

  it('reacts dynamically to storage event toggle', async () => {
    render(
      <MessageItem
        msg={{
          role: 'assistant',
          content: 'Response with toggle',
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

    expect(screen.getByText(/150 токенів/)).toBeInTheDocument();

    // Toggle off via localStorage and storage event
    act(() => {
      localStorage.setItem('llm_assistant_show_tokens', 'false');
      window.dispatchEvent(new Event('storage'));
    });

    await waitFor(() => {
      expect(screen.queryByText(/150 токенів/)).not.toBeInTheDocument();
    });
  });

  it('renders "🎨 Переглянути артефакт: ..." button for assistant messages containing HTML/SVG artifacts', () => {
    const content = `Ось інтерактивна кнопка:
\`\`\`html
<!-- title: Interactive Button -->
<button class="btn btn-primary">Натисни мене</button>
\`\`\``;

    render(
      <MessageItem
        msg={{
          role: 'assistant',
          content,
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );

    const artifactButton = screen.getByRole('button', {
      name: /Переглянути артефакт: Interactive Button/i,
    });
    expect(artifactButton).toBeInTheDocument();
    expect(artifactButton).toHaveTextContent('🎨');
  });

  it('calls onOpenArtifact with parsed artifact when artifact button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenArtifact = vi.fn();
    const content = `\`\`\`svg
<!-- title: Vector Diagram -->
<svg width="100" height="100"><circle cx="50" cy="50" r="40" /></svg>
\`\`\``;

    render(
      <MessageItem
        msg={{
          role: 'assistant',
          content,
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
        onOpenArtifact={onOpenArtifact}
      />
    );

    const artifactButton = screen.getByRole('button', {
      name: /Переглянути артефакт: Vector Diagram/i,
    });
    await user.click(artifactButton);

    expect(onOpenArtifact).toHaveBeenCalledTimes(1);
    expect(onOpenArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Vector Diagram',
        type: 'svg',
      })
    );
  }, 15000);

  it('does not render artifact button for plain messages without HTML/SVG artifacts', () => {
    const plainContent = 'Звичайне текстове повідомлення без коду';
    const pythonContent = `\`\`\`python
def hello():
    print("hello world")
\`\`\``;
    const userWithHtml = `\`\`\`html
<div>Не показувати для користувача</div>
\`\`\``;

    const { rerender } = render(
      <MessageItem
        msg={{
          role: 'assistant',
          content: plainContent,
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /Переглянути артефакт/i })).not.toBeInTheDocument();

    rerender(
      <MessageItem
        msg={{
          role: 'assistant',
          content: pythonContent,
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /Переглянути артефакт/i })).not.toBeInTheDocument();

    rerender(
      <MessageItem
        msg={{
          role: 'user',
          content: userWithHtml,
        }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /Переглянути артефакт/i })).not.toBeInTheDocument();
  });
});
