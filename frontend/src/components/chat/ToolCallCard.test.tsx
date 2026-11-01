import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ToolCallCard from './ToolCallCard';
import type { ToolTraceEntry } from '../../types/api';

describe('ToolCallCard', () => {
  it('renders Ukrainian labels and icons for standard tools', () => {
    const tools: Array<{ tool: string; label: string; icon: string }> = [
      { tool: 'search_documents', label: 'Пошук у документах', icon: '🔍' },
      { tool: 'web_search', label: 'Веб-пошук', icon: '🌐' },
      { tool: 'calculate', label: 'Обчислення', icon: '🧮' },
      { tool: 'get_current_time', label: 'Поточний час', icon: '🕒' },
      { tool: 'read_memory', label: "Перегляд пам'яті", icon: '🧠' },
      { tool: 'list_documents', label: 'Список документів', icon: '📁' },
      { tool: 'get_system_help', label: 'Довідка системи', icon: '❓' },
    ];

    for (const item of tools) {
      const entry: ToolTraceEntry = {
        tool: item.tool,
        args: { q: 'test' },
        category: 'read',
        status: 'completed',
      };
      const { unmount } = render(<ToolCallCard toolTrace={entry} />);
      expect(screen.getByText(new RegExp(item.label, 'i'))).toBeInTheDocument();
      expect(screen.getByText(new RegExp(item.icon))).toBeInTheDocument();
      unmount();
    }
  });

  it('renders completed status badge and duration in ms', () => {
    const entry: ToolTraceEntry = {
      tool: 'calculate',
      args: { expression: '2+2' },
      category: 'read',
      status: 'completed',
      durationMs: 42,
      result: 4,
    };

    render(<ToolCallCard toolTrace={entry} />);
    expect(screen.getByText(/виконано/i)).toBeInTheDocument();
    expect(screen.getByText(/42\s*мс/i)).toBeInTheDocument();
  });

  it('renders failed status badge when tool execution fails', () => {
    const entry: ToolTraceEntry = {
      tool: 'search_documents',
      args: { query: 'fail' },
      category: 'read',
      status: 'failed',
      error: 'RAG error: DB connection lost',
    };

    render(<ToolCallCard toolTrace={entry} />);
    expect(screen.getByText(/помилка/i)).toBeInTheDocument();
  });

  it('collapses and expands details on click', () => {
    const entry: ToolTraceEntry = {
      tool: 'calculate',
      args: { expression: '100 * 5' },
      category: 'read',
      status: 'completed',
      result: 500,
    };

    render(<ToolCallCard toolTrace={entry} defaultExpanded={false} />);

    // Initially collapsed - arguments not visible
    expect(screen.queryByText(/100 \* 5/)).not.toBeInTheDocument();

    // Toggle button to expand
    const toggleBtn = screen.getByRole('button', { name: /деталі|показати|розгорнути/i });
    fireEvent.click(toggleBtn);

    // Now visible
    expect(screen.getByText(/100 \* 5/)).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();

    // Toggle again to collapse
    fireEvent.click(toggleBtn);
    expect(screen.queryByText(/100 \* 5/)).not.toBeInTheDocument();
  });
});
