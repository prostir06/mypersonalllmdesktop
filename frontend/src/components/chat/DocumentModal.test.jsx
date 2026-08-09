import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentModal from './DocumentModal';

describe('DocumentModal', () => {
  const docs = [
    {
      id: 1,
      filename: 'notes.pdf',
      chunks_count: 3,
      file_size: 2048,
    },
  ];

  it('disables upload and list actions while uploading', () => {
    render(
      <DocumentModal
        show
        onHide={vi.fn()}
        userDocuments={docs}
        selectedDocIds={[]}
        onToggleDoc={vi.fn()}
        onDeleteDoc={vi.fn()}
        onUploadClick={vi.fn()}
        uploadingDoc
        fileInputRef={{ current: null }}
        onFileChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Завантаження…/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Готово/i })).toBeDisabled();
  });

  it('shows pending status and disables checkbox until ready', () => {
    render(
      <DocumentModal
        show
        onHide={vi.fn()}
        userDocuments={[
          {
            id: 2,
            filename: 'pending.txt',
            chunks_count: 0,
            file_size: 10,
            status: 'pending',
          },
        ]}
        selectedDocIds={[]}
        onToggleDoc={vi.fn()}
        onDeleteDoc={vi.fn()}
        onUploadClick={vi.fn()}
        uploadingDoc={false}
        fileInputRef={{ current: null }}
        onFileChange={vi.fn()}
      />
    );

    expect(screen.getByText(/індексація…/i)).toBeInTheDocument();
    expect(screen.getByLabelText('pending.txt')).toBeDisabled();
  });

  it('shows failed indexing hint', () => {
    render(
      <DocumentModal
        show
        onHide={vi.fn()}
        userDocuments={[
          {
            id: 3,
            filename: 'bad.txt',
            chunks_count: 0,
            file_size: 10,
            status: 'failed',
          },
        ]}
        selectedDocIds={[]}
        onToggleDoc={vi.fn()}
        onDeleteDoc={vi.fn()}
        onUploadClick={vi.fn()}
        uploadingDoc={false}
        fileInputRef={{ current: null }}
        onFileChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(/помилка індексації — видаліть і спробуйте знову/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText('bad.txt')).toBeDisabled();
  });

  it('calls onLoadMore when Показати ще is clicked', async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    render(
      <DocumentModal
        show
        onHide={vi.fn()}
        userDocuments={docs}
        selectedDocIds={[]}
        onToggleDoc={vi.fn()}
        onDeleteDoc={vi.fn()}
        onUploadClick={vi.fn()}
        uploadingDoc={false}
        fileInputRef={{ current: null }}
        onFileChange={vi.fn()}
        hasMore
        onLoadMore={onLoadMore}
        loadingMore={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /Показати ще/i }));
    expect(onLoadMore).toHaveBeenCalled();
  });
});
