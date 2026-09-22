import React, { useCallback, useState } from 'react';
import { Button, Collapse } from 'react-bootstrap';
import { documentsAPI } from '../../../services/api';
import type { DocumentChunkRecord } from '../../../types/api';
import { parseSheetName, stripSheetHeader } from '../../../utils/sheetContext';

export default function ChunkPreview({ docId }: { docId: string | number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chunks, setChunks] = useState<DocumentChunkRecord[]>([]);
  const [error, setError] = useState('');

  const loadChunks = useCallback(async () => {
    if (chunks.length > 0) {
      setOpen((v) => !v);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await documentsAPI.getChunks(docId, { limit: 3, offset: 0 });
      setChunks(res.data.items);
      setOpen(true);
    } catch (err) {
      console.warn('Document chunk preview failed:', err);
      setError('Не вдалося завантажити фрагменти');
    } finally {
      setLoading(false);
    }
  }, [chunks.length, docId]);

  return (
    <div className="mt-1">
      <Button
        variant="link"
        size="sm"
        className="p-0 text-info"
        disabled={loading}
        onClick={() => void loadChunks()}
      >
        {loading ? 'Завантаження…' : open ? 'Сховати фрагменти' : 'Переглянути фрагменти'}
      </Button>
      {error && <div className="text-danger small">{error}</div>}
      <Collapse in={open}>
        <div className="mt-1">
          {chunks.map((chunk) => {
            const sheet = parseSheetName(chunk.content);
            const body = stripSheetHeader(chunk.content);
            const preview = body.slice(0, 280);
            const sheetLine = sheet ? `Аркуш: ${sheet}\n` : '';
            return (
              <pre
                key={chunk.chunk_index}
                className="small text-muted mb-1 p-2 rounded border border-secondary"
                style={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem' }}
              >
                #{chunk.chunk_index + 1}: {sheetLine}
                {preview}
                {body.length > 280 ? '…' : ''}
              </pre>
            );
          })}
        </div>
      </Collapse>
    </div>
  );
}
