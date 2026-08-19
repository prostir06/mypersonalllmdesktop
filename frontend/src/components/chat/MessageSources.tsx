import type { RagSource } from '../../types/api';
import { formatSimilarityPercent } from '../../utils/normalizeSimilarity';

type MessageSourcesProps = {
  sources: RagSource[];
};

export function MessageSources({ sources }: MessageSourcesProps) {
  if (!sources?.length) return null;

  return (
    <div className="message-sources small text-muted mt-2">
      <div className="fw-semibold">Джерела</div>
      <ul className="mb-0 ps-3">
        {sources.map((s, i) => {
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
