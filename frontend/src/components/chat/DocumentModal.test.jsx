import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentModal from './DocumentModal';

vi.mock('../../services/api', () => ({
  documentsAPI: {
    getChunks: vi.fn().mockResolvedValue({
      data: { items: [{ chunk_index: 0, content: 'chunk text' }], total: 1 },
    }),
  },
}));

describe('DocumentModal', () => {
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
      screen.getByRole('button', { name: /Повторити індексацію/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('bad.txt')).toBeDisabled();
  });

  it('shows RAG fallback badge when no OpenAI key', () => {
    render(
      <DocumentModal
        {...baseProps}
        userDocuments={docs}
        hasOpenaiApiKey={false}
      />
    );

    expect(screen.getAllByText(/RAG: fallback/i).length).toBeGreaterThan(0);
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
});
