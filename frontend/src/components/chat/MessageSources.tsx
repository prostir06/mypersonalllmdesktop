import type { RagSource } from '../../types/api';
import { formatSimilarityPercent } from '../../utils/normalizeSimilarity';

export type MessageSourcesProps = {
  sources: RagSource[];
  ragStatus?: 'ok' | 'empty' | 'error' | 'skipped';
};

export function MessageSources({ sources, ragStatus }: MessageSourcesProps) {
  if (ragStatus === 'error') {
    return (
      <div className="message-sources small text-warning mt-2">
        Контекст RAG недоступний для цієї відповіді
      </div>
    );
  }

  if (!sources?.length) return null;

  return (
    <div className="message-sources small text-muted mt-2">
      <div className="fw-semibold">Джерела</div>
      <ul className="mb-0 ps-3">
        {sources.map((s, i) => {
          if (s.url || s.source_type === 'web_search') {
            return (
              <li
                key={s.id != null ? String(s.id) : (s.url || `${s.filename}-${i}`)}
                className="my-1"
              >
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="badge bg-primary text-decoration-none d-inline-flex align-items-center gap-1"
                >
                  🌐 {s.filename || s.url}
                </a>
              </li>
            );
          }

          const pct = formatSimilarityPercent(s.similarity);
          const label = s.sheet ? `${s.filename} · ${s.sheet}` : s.filename;
          return (
            <li key={`${s.filename}-${i}`}>
              {label}
              {pct ? ` (${pct})` : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
