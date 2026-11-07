/**
 * Deterministic OpenAI-compatible chat + embeddings server for the E2E profile.
 * Same vector for every input so RAG retrieval matches. A slow stream lets stop tests abort.
 */
import http from 'node:http';
import { fileURLToPath } from 'node:url';

function replyFor(body) {
  const blob = JSON.stringify(body.messages || []);
  if (blob.includes('searxng-stub-token')) return 'Знайдено searxng-stub-token';
  return 'Мок-відповідь для перевірки.';
}

function chunk(model, choices, usage) {
  return {
    id: 'chatcmpl-e2e',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices,
    ...(usage ? { usage } : {}),
  };
}

async function handle(req, res) {
    const parts = [];
    for await (const part of req) parts.push(part);
    const raw = Buffer.concat(parts).toString('utf8');
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      res.writeHead(400).end('bad json');
      return;
    }

    const url = req.url || '/';
    if (url.startsWith('/v1/embeddings')) {
      const dim = Number(body.dimensions) || 768;
      const vector = Array.from({ length: dim }, () => 0.01);
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          object: 'list',
          model: body.model || 'text-embedding-3-small',
          data: inputs.map((_, index) => ({ object: 'embedding', index, embedding: vector })),
        })
      );
      return;
    }

    if (!url.startsWith('/v1/chat/completions')) {
      res.writeHead(404).end('not found');
      return;
    }

    const model = body.model || 'gpt-4o-mini';
    const content = replyFor(body);
    const usage = {
      prompt_tokens: 8,
      completion_tokens: content.length,
      total_tokens: 8 + content.length,
    };

    if (!body.stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-e2e',
          object: 'chat.completion',
          model,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage,
        })
      );
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    let clientGone = false;
    res.on('close', () => {
      clientGone = !res.writableFinished;
    });
    const send = (payload) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    const slow = JSON.stringify(body.messages || []).includes('long answer');
    send(chunk(model, [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]));
    for (const part of content.split(/(\s+)/)) {
      if (!part) continue;
      if (slow) await new Promise((resolve) => setTimeout(resolve, 250));
      if (clientGone) return;
      send(chunk(model, [{ index: 0, delta: { content: part }, finish_reason: null }]));
    }
    send(chunk(model, [{ index: 0, delta: {}, finish_reason: 'stop' }]));
    send(chunk(model, [], usage));
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
}

export function createMockLlmServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      if (!res.writableEnded) res.end(err instanceof Error ? err.stack : String(err));
    });
  });
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  createMockLlmServer().listen(4010, '0.0.0.0');
}
