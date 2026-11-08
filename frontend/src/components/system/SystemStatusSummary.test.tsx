import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import SystemStatusSummary from './SystemStatusSummary';
import type { UserSystemSnapshot } from '../../types/api';

const mockSnapshot: UserSystemSnapshot = {
  activeProvider: 'ollama',
  activeModel: 'gemma4:latest',
  modelSupportsVision: true,
  modelSupportsWebSearch: true,
  webSearchEnabled: true,
  configuredProviders: {
    openai: false,
    gemini: false,
    anthropic: false,
    ollamaHost: 'http://localhost:11434',
  },
  ragEmbeddingMode: 'ollama',
  documents: {
    total: 3,
    ready: 2,
    pending: 1,
    failed: 0,
    needsReindex: 0,
    selectedInChat: 1,
  },
  hasCustomSystemPrompt: false,
  pinnedPromptsCount: 4,
  userMemoryNotesCount: 5,
  temperature: 0.7,
  maxTokens: 4096,
};

describe('SystemStatusSummary', () => {
  it('renders all four system status tiles with high-contrast classes', () => {
    const { container } = render(<SystemStatusSummary snapshot={mockSnapshot} />);

    expect(screen.getByText(/поточний статус системи/i)).toBeInTheDocument();
    expect(screen.getByText('Провайдер')).toBeInTheDocument();
    expect(screen.getByText('ollama (gemma4:latest)')).toBeInTheDocument();

    expect(screen.getByText('RAG База')).toBeInTheDocument();
    expect(screen.getByText(/ollama \(2 готових, 1 обрано\)/)).toBeInTheDocument();

    expect(screen.getByText('Можливості')).toBeInTheDocument();
    expect(screen.getByText(/Vision \(✅\), Пошук \(🌐 Увімкнено\)/)).toBeInTheDocument();

    expect(screen.getByText("Пам'ять та Ролі")).toBeInTheDocument();
    expect(
      screen.getByText(/5 глобальних фактів, 4 закріплених ролей/)
    ).toBeInTheDocument();

    const tiles = container.querySelectorAll('.system-status-tile');
    expect(tiles.length).toBe(4);

    const labels = container.querySelectorAll('.status-label');
    expect(labels.length).toBe(4);

    const values = container.querySelectorAll('.status-value');
    expect(values.length).toBe(4);
  });

  it('renders fallback representation when search is not supported', () => {
    const snapshotWithoutSearch: UserSystemSnapshot = {
      ...mockSnapshot,
      modelSupportsVision: false,
      modelSupportsWebSearch: false,
      webSearchEnabled: false,
    };

    render(<SystemStatusSummary snapshot={snapshotWithoutSearch} />);

    expect(screen.getByText(/Vision \(❌\), Пошук \(—\)/)).toBeInTheDocument();
  });
});
