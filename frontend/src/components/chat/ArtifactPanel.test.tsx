import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArtifactPanel, { buildSafeSrcDoc } from './ArtifactPanel';
import type { Artifact } from '../../types/api';
import { copyTextWithToast } from '../../utils/clipboard';
import { downloadTextFile } from '../../hooks/useChatExport';
import { downloadArtifactAsDocx } from '../../utils/docxExport';

vi.mock('../../utils/clipboard', () => ({
  copyTextWithToast: vi.fn(),
}));

vi.mock('../../hooks/useChatExport', () => ({
  downloadTextFile: vi.fn(),
}));

vi.mock('../../utils/docxExport', () => ({
  downloadArtifactAsDocx: vi.fn().mockResolvedValue(undefined),
}));

describe('ArtifactPanel', () => {
  const htmlArtifact: Artifact = {
    id: 'artifact-html-1',
    type: 'html',
    title: 'Калькулятор розрахунку ROI',
    language: 'html',
    content: '<div class="calculator"><h3>Розрахунок</h3><button>Обчислити</button></div>',
  };

  const svgArtifact: Artifact = {
    id: 'artifact-svg-1',
    type: 'svg',
    title: 'Діаграма потоків даних',
    language: 'svg',
    content: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="blue"/></svg>',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders artifact title and type badge', () => {
    render(<ArtifactPanel artifact={htmlArtifact} onClose={vi.fn()} />);

    expect(screen.getByText('Калькулятор розрахунку ROI')).toBeInTheDocument();
    expect(screen.getByText('HTML')).toBeInTheDocument();
  });

  it('renders sandboxed iframe with sandbox="allow-scripts" and strictly NO allow-same-origin', () => {
    render(<ArtifactPanel artifact={htmlArtifact} onClose={vi.fn()} />);

    const iframe = screen.getByTitle('Калькулятор розрахунку ROI');
    expect(iframe).toBeInTheDocument();
    expect(iframe.tagName.toLowerCase()).toBe('iframe');

    const sandbox = iframe.getAttribute('sandbox');
    expect(sandbox).toBe('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });

  it('injects artifact content into isolated /artifact-sandbox.html iframe via postMessage', () => {
    render(<ArtifactPanel artifact={htmlArtifact} onClose={vi.fn()} />);

    const iframe = screen.getByTitle('Калькулятор розрахунку ROI') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('/artifact-sandbox.html');
    expect(iframe.getAttribute('srcdoc')).toBeNull();

    const postMessageSpy = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
      configurable: true,
    });

    iframe.dispatchEvent(new Event('load'));

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ARTIFACT_RENDER',
        html: expect.stringContaining(
          '<div class="calculator"><h3>Розрахунок</h3><button>Обчислити</button></div>'
        ),
      }),
      '*'
    );
  });

  it('switches between "Попередній перегляд" and "Код" tabs', async () => {
    const user = userEvent.setup();
    render(<ArtifactPanel artifact={htmlArtifact} onClose={vi.fn()} />);

    // Initially on Preview tab
    expect(screen.getByTitle('Калькулятор розрахунку ROI')).toBeInTheDocument();
    expect(screen.queryByTestId('artifact-raw-code')).not.toBeInTheDocument();

    // Switch to Code tab
    const codeTab = screen.getByRole('button', { name: /код/i });
    await user.click(codeTab);

    expect(screen.getByTestId('artifact-raw-code')).toBeInTheDocument();
    expect(screen.getByText(/Розрахунок/)).toBeInTheDocument();
    expect(screen.queryByTitle('Калькулятор розрахунку ROI')).not.toBeInTheDocument();

    // Switch back to Preview tab
    const previewTab = screen.getByRole('button', { name: /попередній перегляд/i });
    await user.click(previewTab);

    expect(screen.getByTitle('Калькулятор розрахунку ROI')).toBeInTheDocument();
    expect(screen.queryByTestId('artifact-raw-code')).not.toBeInTheDocument();
  });

  it('in "Код" tab displays raw code text and line count', async () => {
    const user = userEvent.setup();
    render(<ArtifactPanel artifact={htmlArtifact} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /код/i }));

    const codeElement = screen.getByTestId('artifact-raw-code');
    expect(codeElement).toBeInTheDocument();
    expect(codeElement.textContent).toBe(htmlArtifact.content);
    expect(screen.getByText(/1 ряд/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ArtifactPanel artifact={htmlArtifact} onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: /закрити/i });
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('handles "Копіювати код" and file download', async () => {
    const user = userEvent.setup();
    render(<ArtifactPanel artifact={htmlArtifact} onClose={vi.fn()} />);

    // Copy action
    const copyBtn = screen.getByRole('button', { name: /копіювати/i });
    await user.click(copyBtn);
    expect(copyTextWithToast).toHaveBeenCalledWith(
      htmlArtifact.content,
      expect.stringContaining('скопійовано')
    );

    // Download action
    const downloadBtn = screen.getByRole('button', { name: /завантажити/i });
    await user.click(downloadBtn);
    expect(downloadTextFile).toHaveBeenCalledWith(
      htmlArtifact.content,
      expect.stringMatching(/\.html$/),
      expect.stringContaining('text/html')
    );
  });

  it('downloads svg artifact with .svg extension and correct mime type', async () => {
    const user = userEvent.setup();
    render(<ArtifactPanel artifact={svgArtifact} onClose={vi.fn()} />);

    const downloadBtn = screen.getByRole('button', { name: /завантажити/i });
    await user.click(downloadBtn);

    expect(downloadTextFile).toHaveBeenCalledWith(
      svgArtifact.content,
      expect.stringMatching(/\.svg$/),
      expect.stringContaining('image/svg+xml')
    );
  });

  it('toggles fullscreen state when fullscreen button is clicked', async () => {
    const user = userEvent.setup();
    render(<ArtifactPanel artifact={htmlArtifact} onClose={vi.fn()} />);

    const panel = screen.getByTestId('artifact-panel');
    expect(panel).not.toHaveClass('position-fixed');

    const fullscreenBtn = screen.getByRole('button', { name: /на весь екран/i });
    await user.click(fullscreenBtn);

    expect(panel).toHaveClass('position-fixed');

    const collapseBtn = screen.getByRole('button', { name: /згорнути/i });
    await user.click(collapseBtn);

    expect(panel).not.toHaveClass('position-fixed');
  });

  it('renders A4 document sheet preview for docx artifact, supports live editing, and triggers .docx download', async () => {
    const docxArtifact: Artifact = {
      id: 'art-docx-1',
      type: 'docx',
      title: 'Договір поставки',
      language: 'markdown',
      content: '# Договір поставки\n\nПункт 1. Загальні положення.',
    };

    render(<ArtifactPanel artifact={docxArtifact} onClose={vi.fn()} />);

    expect(screen.getByText('DOCX')).toBeInTheDocument();
    expect(screen.getByTestId('artifact-docx-sheet')).toHaveTextContent('Договір поставки');

    // Switch to Edit tab
    fireEvent.click(screen.getByRole('button', { name: /Редагувати/i }));
    const editor = screen.getByTestId('artifact-editor-textarea') as HTMLTextAreaElement;
    expect(editor.value).toContain('Пункт 1. Загальні положення.');

    fireEvent.change(editor, {
      target: { value: '# Договір поставки\n\nПункт 1. Оновлена редакція.' },
    });

    // Switch back to Preview tab and verify live updated text
    fireEvent.click(screen.getByRole('button', { name: /Перегляд/i }));
    expect(screen.getByTestId('artifact-docx-sheet')).toHaveTextContent(
      'Пункт 1. Оновлена редакція.'
    );

    // Primary .docx download button
    const downloadDocxBtn = screen.getByRole('button', {
      name: /завантажити документ у форматі word/i,
    });
    fireEvent.click(downloadDocxBtn);
    expect(downloadArtifactAsDocx).toHaveBeenCalledWith(
      '# Договір поставки\n\nПункт 1. Оновлена редакція.',
      'Договір поставки'
    );
  });

  it('supports resetting changes with "Скинути зміни" button in edit mode', () => {
    const docxArtifact: Artifact = {
      id: 'art-docx-2',
      type: 'docx',
      title: 'Акт виконаних робіт',
      language: 'markdown',
      content: '# Акт виконаних робіт\n\nРоботи виконано повністю.',
    };

    render(<ArtifactPanel artifact={docxArtifact} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Редагувати/i }));
    expect(screen.queryByRole('button', { name: /Скинути зміни/i })).not.toBeInTheDocument();

    const editor = screen.getByTestId('artifact-editor-textarea') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'Змінений текст' } });

    const resetBtn = screen.getByRole('button', { name: /Скинути зміни/i });
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);
    expect(editor.value).toBe(docxArtifact.content);
    expect(screen.queryByRole('button', { name: /Скинути зміни/i })).not.toBeInTheDocument();
  });

  it('provides secondary .docx download button for html artifacts', async () => {
    render(<ArtifactPanel artifact={htmlArtifact} onClose={vi.fn()} />);

    const docxBtn = screen.getByRole('button', { name: /word \(\.docx\)/i });
    expect(docxBtn).toBeInTheDocument();

    fireEvent.click(docxBtn);
    expect(downloadArtifactAsDocx).toHaveBeenCalledWith(
      htmlArtifact.content,
      htmlArtifact.title
    );
  });

  it('updates editedContent when artifact streaming updates content if not dirty, but keeps dirty content', () => {
    const { rerender } = render(
      <ArtifactPanel artifact={htmlArtifact} onClose={vi.fn()} />
    );

    // Switch to edit tab
    fireEvent.click(screen.getByRole('button', { name: /Редагувати/i }));
    let editor = screen.getByTestId('artifact-editor-textarea') as HTMLTextAreaElement;
    expect(editor.value).toBe(htmlArtifact.content);

    // Streaming update without dirty
    rerender(
      <ArtifactPanel
        artifact={{ ...htmlArtifact, content: `${htmlArtifact.content} <p>Додаток</p>` }}
        onClose={vi.fn()}
      />
    );
    editor = screen.getByTestId('artifact-editor-textarea') as HTMLTextAreaElement;
    expect(editor.value).toContain('<p>Додаток</p>');

    // User types into editor making it dirty
    fireEvent.change(editor, { target: { value: 'Користувацька правка' } });

    // Another streaming update arrives
    rerender(
      <ArtifactPanel
        artifact={{ ...htmlArtifact, content: `${htmlArtifact.content} <p>Новий стрім</p>` }}
        onClose={vi.fn()}
      />
    );
    editor = screen.getByTestId('artifact-editor-textarea') as HTMLTextAreaElement;
    expect(editor.value).toBe('Користувацька правка');
  });

  describe('buildSafeSrcDoc helper', () => {
    it('wraps HTML fragment in clean document with reset styles and viewport', () => {
      const srcDoc = buildSafeSrcDoc(htmlArtifact);
      expect(srcDoc).toContain('<!DOCTYPE html>');
      expect(srcDoc).toContain('<meta name="viewport"');
      expect(srcDoc).toContain('box-sizing: border-box;');
      expect(srcDoc).toContain(htmlArtifact.content);
    });

    it('centers SVG artifact in preview with flex styling', () => {
      const srcDoc = buildSafeSrcDoc(svgArtifact);
      expect(srcDoc).toContain('<!DOCTYPE html>');
      expect(srcDoc).toContain('display: flex;');
      expect(srcDoc).toContain('align-items: center;');
      expect(srcDoc).toContain('justify-content: center;');
      expect(srcDoc).toContain(svgArtifact.content);
    });

    it('preserves complete HTML documents with DOCTYPE', () => {
      const fullDocArtifact: Artifact = {
        id: 'artifact-full',
        type: 'html',
        title: 'Full Page',
        language: 'html',
        content: '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hi</h1></body></html>',
      };
      const srcDoc = buildSafeSrcDoc(fullDocArtifact);
      expect(srcDoc).toContain('<h1>Hi</h1>');
      expect(srcDoc).toContain('<!DOCTYPE html>');
    });
  });
});
