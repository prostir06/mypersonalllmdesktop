/**
 * Real pgvector database. Not part of `npm test` (Windows dev may have no Docker).
 * CI and `npm run test:integration` start a throwaway container and migrate from zero.
 */
import path from 'path';
import { spawnSync } from 'child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const backendRoot = path.join(__dirname, '../../..');

function migrate(databaseUrl: string): void {
  const result = spawnSync(
    'npx',
    ['prisma', 'migrate', 'deploy', '--config', 'prisma/prisma.config.ts'],
    {
      cwd: backendRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'prisma migrate deploy failed');
  }
}

describe('pgvector integration', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:0.8.7-pg15')
      .withDatabase('llm_assistant')
      .withUsername('postgres')
      .withPassword('password')
      .start();
    process.env.DATABASE_URL = container.getConnectionUri();
    migrate(process.env.DATABASE_URL);
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('applies migrations from zero, including vector', async () => {
    const { prisma } = await import('../../config/prisma');
    expect(await prisma.user.count()).toBe(0);
    const extensions = await prisma.$queryRawUnsafe<Array<{ extname: string }>>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'"
    );
    expect(extensions).toHaveLength(1);
  });

  it('finds a message through the FTS query', async () => {
    const { prisma } = await import('../../config/prisma');
    const { buildMessageFtsQuery } = await import('../../utils/messageFts');
    const user = await prisma.user.create({
      data: { name: 'fts', email: `fts-${Date.now()}@test.local`, password: 'x' },
    });
    const conversation = await prisma.conversation.create({
      data: { userId: user.id, title: 'fts' },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: 'унікальний маркер інтеграції',
      },
    });
    const rows = await prisma.$queryRaw<Array<{ content: string }>>(
      buildMessageFtsQuery(user.id, 'маркер', null)
    );
    expect(rows.some((row) => row.content.includes('маркер'))).toBe(true);
  });

  it('records shared-key spend and blocks the next turn over the limit', async () => {
    const { prisma } = await import('../../config/prisma');
    const { assertSharedKeyQuota, recordUsage } = await import('../../services/usage/quota');
    const user = await prisma.user.create({
      data: {
        name: 'quota',
        email: `quota-${Date.now()}@test.local`,
        password: 'x',
        sharedKeyDailyLimitUsd: '0.50',
      },
    });
    await recordUsage({
      userId: user.id,
      provider: 'openai',
      model: 'gpt-4o-mini',
      promptTokens: 10,
      completionTokens: 5,
      costUsd: 1,
      sharedKey: true,
    });
    const saved = await prisma.usageLedger.findFirst({ where: { userId: user.id } });
    expect(saved?.sharedKey).toBe(true);
    await expect(
      assertSharedKeyQuota({ userId: user.id, sharedKey: true })
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('writes chunks in batches and retrieves one by hybrid search', async () => {
    const { prisma } = await import('../../config/prisma');
    const { insertChunks } = await import('../../services/documents/indexing');
    const { findRelevantChunks } = await import('../../services/embeddings/retrieve');
    const user = await prisma.user.create({
      data: { name: 'rag', email: `rag-${Date.now()}@test.local`, password: 'x' },
    });
    const doc = await prisma.document.create({
      data: {
        userId: user.id,
        filename: 'hybrid.txt',
        fileType: 'text/plain',
        fileSize: 12,
        status: 'ready',
        embeddingProvider: 'openai',
      },
    });
    const filler = Array.from({ length: 1001 }, (_, index) => `batch-${index}`);
    await prisma.$transaction(async (tx) => {
      await insertChunks(tx, doc.id, filler, filler.map(() => null), false);
    });
    expect(await prisma.documentChunk.count({ where: { documentId: doc.id } })).toBe(1001);

    const vector = Array.from({ length: 768 }, () => 0.02);
    await prisma.$executeRawUnsafe(
      `INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4::vector)`,
      doc.id,
      1001,
      'hybrid marker token',
      `[${vector.join(',')}]`
    );
    const found = await findRelevantChunks(vector, user.id, [doc.id], 5, {}, 'openai', 'marker');
    expect(found.some((row) => row.content.includes('hybrid marker'))).toBe(true);
  });
});
