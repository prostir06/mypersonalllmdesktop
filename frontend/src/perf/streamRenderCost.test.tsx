import React, { Profiler, useEffect, useState, type ProfilerOnRenderCallback } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReactMarkdown from 'react-markdown';
import MessageItem from '../components/chat/MessageItem';
import StreamingMarkdown from '../components/chat/StreamingMarkdown';
import type { ToolTraceEntry } from '../types/api';

const CHUNKS = Array.from({ length: 40 }, (_, i) => `Абзац ${i}. ${'слово '.repeat(30)}\n\n`);
const TOOLS: ToolTraceEntry[] = [1, 2, 3, 4].map((id) => ({
  tool: `lookup_${id}`,
  args: { q: 'довгий запит' },
  category: 'read',
  status: 'completed',
  result: { rows: id },
}));

type Sample = { commits: number; renderMs: number; firstTextMs: number | null };

function useChunkPump(size: number, onDone: () => void) {
  const [count, setCount] = useState(0);
  const text = CHUNKS.slice(0, count).join('');
  useEffect(() => {
    if (count >= CHUNKS.length) {
      onDone();
      return;
    }
    setCount((n) => Math.min(CHUNKS.length, n + size));
  }, [count, onDone, size]);
  return text;
}

function PerTokenStream({ onDone }: { onDone: () => void }) {
  const text = useChunkPump(1, onDone);
  return (
    <>
      <MessageItem
        msg={{ role: 'assistant', content: '', tool_trace: TOOLS }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
      <ReactMarkdown>{text}</ReactMarkdown>
    </>
  );
}

function BatchedStream({ onDone }: { onDone: () => void }) {
  const text = useChunkPump(8, onDone);
  return (
    <>
      <MessageItem
        msg={{ role: 'assistant', content: '', tool_trace: TOOLS }}
        idx={0}
        speakingIdx={null}
        onSpeak={() => {}}
        onCopy={() => {}}
      />
      <StreamingMarkdown text={text} />
    </>
  );
}

function measure(node: React.ReactElement): Promise<Sample> {
  const sample: Sample = { commits: 0, renderMs: 0, firstTextMs: null };
  const started = performance.now();
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    sample.commits += 1;
    sample.renderMs += actualDuration;
    if (sample.firstTextMs == null && document.body.textContent?.includes('Абзац 0')) {
      sample.firstTextMs = performance.now() - started;
    }
  };
  render(<Profiler id="stream" onRender={onRender}>{node}</Profiler>);
  return waitFor(() => {
    expect(document.body.textContent).toContain('Абзац 39');
  }).then(() => sample);
}

describe('stream render cost', () => {
  it('coalesces a long tool-bearing reply into fewer commits than per-token markdown', async () => {
    let perDone = false;
    const perToken = await measure(<PerTokenStream onDone={() => { perDone = true; }} />);
    expect(perDone).toBe(true);

    let batchedDone = false;
    const batched = await measure(<BatchedStream onDone={() => { batchedDone = true; }} />);
    expect(batchedDone).toBe(true);

    expect(batched.commits).toBeLessThan(perToken.commits / 2);
    console.info(
      `stream-render per-token commits=${perToken.commits} renderMs=${perToken.renderMs.toFixed(1)} firstTextMs=${perToken.firstTextMs?.toFixed(1)} batched commits=${batched.commits} renderMs=${batched.renderMs.toFixed(1)} firstTextMs=${batched.firstTextMs?.toFixed(1)}`
    );
  });
});
