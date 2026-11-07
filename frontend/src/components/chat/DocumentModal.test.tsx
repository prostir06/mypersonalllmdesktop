import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentModal from './DocumentModal';
import { documentsAPI } from '../../services/api';

vi.mock('../../services/api', () => ({
  documentsAPI: {
    getChunks: vi.fn().mockResolvedValue({
      data: { items: [{ chunk_index: 0, content: 'chunk text' }], total: 1, limit: 20, offset: 0 },
    }),
  },
}));

describe('DocumentModal', () => {
  beforeEach(() => {
    vi.mocked(documentsAPI.getChunks).mockResolvedValue({
      data: { items: [{ chunk_index: 0, content: 'chunk text' }], total: 1, limit: 20, offset: 0 },
    } as Awaited<ReturnType<typeof documentsAPI.getChunks>>);
  });

  afterEach(() => {
    cleanup();
  });

  const docs = [
    {
      id: 1,
      filename: 'notes.pdf',
      chunks_count: 3,
      file_size: 2048,
      status: 'ready',
      has_embeddings: true,
    },
  ];

  const baseProps = {
    show: true,
    onHide: vi.fn(),
    selectedDocIds: [],
    onToggleDoc: vi.fn(),
    onDeleteDoc: vi.fn(),
    onRetryDoc: vi.fn(),
    onReindexDoc: vi.fn(),
    onUploadClick: vi.fn(),
    uploadingDoc: false,
    fileInputRef: { current: null },
    onFileChange: vi.fn(),
  };

  it('disables upload and list actions while uploading', () => {
    render(
      <DocumentModal
        {...baseProps}
        userDocuments={docs}
        uploadingDoc
      />
    );

    expect(screen.getByText(/Завантаження…/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Готово/i })).toBeDisabled();
  });

  it('shows pending status and disables checkbox until ready', () => {
    render(
      <DocumentModal
        {...baseProps}
        userDocuments={[
          {
            id: 2,
            filename: 'pending.txt',
            chunks_count: 0,
            file_size: 10,
            status: 'pending',
          },
        ]}
      />
    );

    expect(screen.getByText(/індексація…/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Документ індексується — вибір недоступний/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText('pending.txt')).toBeDisabled();
  });

  it('shows failed status with retry button', () => {
    render(
      <DocumentModal
        {...baseProps}
        userDocuments={[
          {
            id: 3,
            filename: 'bad.txt',
            chunks_count: 0,
            file_size: 10,
            status: 'failed',
            failure_reason: 'PDF corrupt',
          },
        ]}
      />
    );

    expect(screen.getByText(/PDF corrupt/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Індексація не вдалася — вибір недоступний/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Повторити індексацію/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('bad.txt')).toBeDisabled();
  });

  it('shows RAG fallback badge when mode is fallback', () => {
    render(
      <DocumentModal
        {...baseProps}
        userDocuments={docs}
        ragEmbeddingMode="fallback"
      />
    );

    expect(screen.getAllByText(/RAG: fallback/i).length).toBeGreaterThan(0);
  });

  it('shows reindex button when needs_reindex', () => {
    render(
      <DocumentModal
        {...baseProps}
        userDocuments={[
          {
            ...docs[0],
            needs_reindex: true,
            has_embeddings: false,
          },
        ]}
        ragEmbeddingMode="ollama"
      />
    );

    expect(
      screen.getByRole('button', { name: /Переіндексувати/i })
    ).toBeInTheDocument();
  });

  it('adds filename to delete aria-label', () => {
    render(
      <DocumentModal
        {...baseProps}
        userDocuments={docs}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Видалити файл notes.pdf' })
    ).toBeInTheDocument();
  });

  it('calls onLoadMore when Показати ще is clicked', async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    render(
      <DocumentModal
        {...baseProps}
        userDocuments={docs}
        hasMore
        onLoadMore={onLoadMore}
        loadingMore={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /Показати ще/i }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('shows error when chunk preview load fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(documentsAPI.getChunks).mockRejectedValue(new Error('api down'));
    const user = userEvent.setup();

    render(
      <DocumentModal
        {...baseProps}
        userDocuments={docs}
      />
    );

    await user.click(
      screen.getByRole('button', { name: /Переглянути фрагменти/i })
    );

    await waitFor(() => {
      expect(screen.getByText('Не вдалося завантажити фрагменти')).toBeInTheDocument();
    });
    expect(warn).toHaveBeenCalledWith(
      'Document chunk preview failed:',
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('shows a file-type hint for xlsx vs pdf', () => {
    render(
      <DocumentModal
        {...baseProps}
        userDocuments={[
          { ...docs[0], filename: 'notes.pdf' },
          {
            id: 9,
            filename: 'sales.xlsx',
            chunks_count: 1,
            file_size: 100,
            status: 'ready',
          },
        ]}
      />
    );

    expect(screen.getByText(/PDF \|/)).toBeInTheDocument();
    expect(screen.getByText(/XLSX \|/)).toBeInTheDocument();
  });

  it('shows sheet name in chunk preview', async () => {
    vi.mocked(documentsAPI.getChunks).mockResolvedValue({
      data: {
        items: [{ chunk_index: 0, content: '## Sheet: Inventory\nSKU,1' }],
        total: 1,
        limit: 20,
        offset: 0,
      },
    } as Awaited<ReturnType<typeof documentsAPI.getChunks>>);
    const user = userEvent.setup();
    render(
      <DocumentModal
        {...baseProps}
        userDocuments={[
          {
            id: 9,
            filename: 'sales.xlsx',
            chunks_count: 1,
            file_size: 100,
            status: 'ready',
          },
        ]}
      />
    );

    await user.click(
      screen.getByRole('button', { name: /Переглянути фрагменти/i })
    );

    await waitFor(() => {
      expect(screen.getByText(/Аркуш: Inventory/)).toBeInTheDocument();
    });
  });
});
