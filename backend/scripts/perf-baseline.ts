/**
 * Perf baseline CLI — prints JSON lines for SLIs S2/S3/S4 (S1 is manual).
 *
 * Usage (from backend/):
 *   npm run perf:baseline
 *
 * Env:
 *   DATABASE_URL, PERF_ENV=local|docker
 *   PERF_QUERY (default: "test query")
 *   PERF_USER_ID (default: 1)
 *   PERF_CONVERSATION_ID (optional, for S4)
 *   OLLAMA_API_URL / OPENAI_API_KEY for S3
 */
import path from 'path';
import dotenv from 'dotenv';
import { nowMs, elapsedMs } from '../src/utils/perfTimer';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function emit(row: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...row }));
}

function dummyEmbedding(dims: number): number[] {
  return Array.from({ length: dims }, (_, i) => (i % 10) / 10);
}

async function runS2(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    emit({ sli: 'S2', skipped: true, reason: 'no DATABASE_URL' });
    return;
  }

  try {
    const EmbeddingService = (await import('../src/services/EmbeddingService'))
      .default;
    const userId = parseInt(process.env.PERF_USER_ID || '1', 10);
    const query = process.env.PERF_QUERY || 'test query';
    const embedding = dummyEmbedding(768);

    const t0 = nowMs();
    const chunks = await EmbeddingService.findRelevantChunks(
      embedding,
      userId,
      [],
      5,
      {},
      null,
      query
    );
    emit({
      sli: 'S2',
      label: 'retrieve_hybrid',
      ms: elapsedMs(t0),
      chunks: chunks.length,
      userId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ sli: 'S2', skipped: true, reason: message });
  }
}

async function runS3(): Promise<void> {
  const sample = [
    'alpha chunk one',
    'beta chunk two',
    'gamma chunk three',
    'delta chunk four',
    'epsilon chunk five',
    'zeta chunk six',
    'eta chunk seven',
    'theta chunk eight',
  ];

  const ollamaUrl = process.env.OLLAMA_API_URL;
  if (ollamaUrl) {
    try {
      const { OllamaEmbeddingProvider } = await import(
        '../src/services/embeddings/OllamaEmbeddingProvider'
      );
      const t0 = nowMs();
      const out = await OllamaEmbeddingProvider.generateBatchEmbeddings(
        sample,
        ollamaUrl
      );
      emit({
        sli: 'S3',
        label: 'ollama_batch',
        ms: elapsedMs(t0),
        n: sample.length,
        ok: out.filter(Boolean).length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ sli: 'S3', label: 'ollama_batch', skipped: true, reason: message });
    }
  } else {
    emit({
      sli: 'S3',
      label: 'ollama_batch',
      skipped: true,
      reason: 'no OLLAMA_API_URL',
    });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const { OpenAiEmbeddingProvider } = await import(
        '../src/services/embeddings/OpenAiEmbeddingProvider'
      );
      const t0 = nowMs();
      const out = await OpenAiEmbeddingProvider.generateBatchEmbeddings(
        sample,
        openaiKey
      );
      emit({
        sli: 'S3',
        label: 'openai_batch',
        ms: elapsedMs(t0),
        n: sample.length,
        ok: out.filter(Boolean).length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ sli: 'S3', label: 'openai_batch', skipped: true, reason: message });
    }
  } else {
    emit({
      sli: 'S3',
      label: 'openai_batch',
      skipped: true,
      reason: 'no OPENAI_API_KEY',
    });
  }
}

async function runS4(): Promise<void> {
  const rawId = process.env.PERF_CONVERSATION_ID;
  if (!rawId || !process.env.DATABASE_URL) {
    emit({
      sli: 'S4',
      skipped: true,
      reason: !process.env.DATABASE_URL
        ? 'no DATABASE_URL'
        : 'no PERF_CONVERSATION_ID',
    });
    return;
  }

  const conversationId = parseInt(rawId, 10);
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    emit({ sli: 'S4', skipped: true, reason: 'invalid PERF_CONVERSATION_ID' });
    return;
  }

  try {
    const { loadRecentMessages } = await import('../src/services/chat/history');
    const prisma = (await import('../src/config/prisma')).default;

    const count = await prisma.message.count({ where: { conversationId } });
    const t0 = nowMs();
    const msgs = await loadRecentMessages(conversationId);
    emit({
      sli: 'S4',
      label: 'loadRecentMessages',
      ms: elapsedMs(t0),
      rawCount: count,
      providerMsgs: msgs.length,
      conversationId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ sli: 'S4', skipped: true, reason: message });
  }
}

async function main(): Promise<void> {
  emit({
    sli: 'meta',
    label: 'start',
    perfEnv: process.env.PERF_ENV || 'local',
    nodeEnv: process.env.NODE_ENV || '',
  });
  await runS2();
  await runS3();
  await runS4();
  emit({ sli: 'meta', label: 'done' });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
