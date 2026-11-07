export type StreamingMarkdownParts = {
  done: string;
  tail: string;
};

/** Index of an opening fence that has no matching close, or -1. */
function unclosedFenceIndex(text: string): number {
  const re = /^[ \t]*(```|~~~)/gm;
  let open = -1;
  let marker = '';
  for (const match of text.matchAll(re)) {
    const token = match[1];
    if (open < 0) {
      open = match.index ?? 0;
      marker = token;
    } else if (token === marker) {
      open = -1;
      marker = '';
    }
  }
  return open;
}

/**
 * Completed markdown blocks stay in `done`. The unfinished tail is plain text:
 * an open fence, or the paragraph after the last blank line.
 */
export function splitStreamingMarkdown(text: string): StreamingMarkdownParts {
  if (!text) return { done: '', tail: '' };

  const fenceAt = unclosedFenceIndex(text);
  if (fenceAt >= 0) {
    return {
      done: text.slice(0, fenceAt).replace(/\n+$/, ''),
      tail: text.slice(fenceAt),
    };
  }

  const splitAt = text.lastIndexOf('\n\n');
  if (splitAt < 0) return { done: '', tail: text };

  const tail = text.slice(splitAt + 2);
  if (!tail.trim()) return { done: text.slice(0, splitAt), tail: '' };
  return { done: text.slice(0, splitAt), tail };
}
