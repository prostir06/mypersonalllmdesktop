import type { RagSource } from '../../types/api';

type MessageSourcesProps = {
  sources: RagSource[];
};

export function MessageSources({ sources }: MessageSourcesProps) {
  if (!sources?.length) return null;

  return (
    <div className="message-sources small text-muted mt-2">
      <div className="fw-semibold">Джерела</div>
      <ul className="mb-0 ps-3">
        {sources.map((s, i) => (
          <li key={`${s.filename}-${i}`}>
            {s.filename}
            {typeof s.similarity === 'number'
              ? ` (${Math.round(s.similarity * 100)}%)`
              : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
