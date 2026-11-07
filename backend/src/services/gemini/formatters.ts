import { randomUUID } from 'crypto';
import type { NormalizedToolCall, ToolDefinitionSpec } from '../providers/types';

export type GeminiMessagePart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown>; id: string } }
  | { functionResponse: { name: string; response: Record<string, unknown>; id: string } };

export type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiMessagePart[];
};

type IncomingToolCall = {
  id?: string;
  name?: string;
  argumentsJson?: string;
  function?: { name?: string; arguments?: unknown };
};

type IncomingMessage = {
  role: string;
  content?: unknown;
  name?: string;
  id?: string;
  tool_call_id?: string;
  tool_calls?: IncomingToolCall[];
};

type GeminiFunctionCall = { id?: string; name?: string; args?: unknown };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      return asRecord(JSON.parse(raw)) ?? {};
    } catch {
      return {};
    }
  }
  return asRecord(raw) ?? {};
}

function toolResponseObject(content: unknown): Record<string, unknown> {
  if (typeof content === 'string') {
    try {
      const parsed: unknown = JSON.parse(content);
      return asRecord(parsed) ?? { result: parsed };
    } catch {
      return { result: content };
    }
  }
  return asRecord(content) ?? { result: content ?? null };
}

function appendContent(contents: GeminiContent[], role: 'user' | 'model', parts: GeminiMessagePart[]) {
  if (parts.length === 0) return;
  const last = contents[contents.length - 1];
  if (last && last.role === role) {
    last.parts.push(...parts);
    return;
  }
  contents.push({ role, parts });
}

function textAndImageParts(content: unknown): GeminiMessagePart[] {
  const parts: GeminiMessagePart[] = [];
  if (typeof content === 'string') {
    if (content.length > 0) parts.push({ text: content });
    return parts;
  }
  if (!Array.isArray(content)) return parts;
  for (const part of content as Array<{ type?: string; text?: string; image_url?: { url?: string } }>) {
    if (part.type === 'text' && part.text) {
      parts.push({ text: part.text });
    } else if (part.type === 'image_url' && part.image_url?.url) {
      const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }
  }
  return parts;
}

function functionCallParts(calls: IncomingToolCall[], names: Map<string, string>): GeminiMessagePart[] {
  const parts: GeminiMessagePart[] = [];
  for (const call of calls) {
    const name = call.function?.name || call.name || 'tool';
    const id = (call.id && call.id.trim()) || `gemini_${name}_${randomUUID()}`;
    names.set(id, name);
    parts.push({
      functionCall: {
        id,
        name,
        args: parseArgs(call.function?.arguments ?? call.argumentsJson),
      },
    });
  }
  return parts;
}

export function buildGeminiPayload(
  messages: Array<{ role: string; content?: unknown }>,
  options: Record<string, unknown> = {}
) {
  let systemInstructionText = '';
  const contents: GeminiContent[] = [];
  const callNames = new Map<string, string>();

  for (const raw of messages) {
    const msg = raw as IncomingMessage;
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemInstructionText += (systemInstructionText ? '\n\n' : '') + msg.content;
      }
      continue;
    }

    if (msg.role === 'tool') {
      const id = (msg.tool_call_id || msg.id || `gemini_tool_${randomUUID()}`).trim();
      const name = msg.name || callNames.get(id) || 'tool';
      appendContent(contents, 'user', [{
        functionResponse: { id, name, response: toolResponseObject(msg.content) },
      }]);
      continue;
    }

    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    const parts = textAndImageParts(msg.content);
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      parts.push(...functionCallParts(msg.tool_calls, callNames));
    }
    appendContent(contents, role, parts);
  }

  const config: Record<string, unknown> = {
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
    maxOutputTokens: typeof options.max_tokens === 'number' ? options.max_tokens : 4096,
  };

  if (options.signal instanceof AbortSignal) {
    config.abortSignal = options.signal;
  }

  if (systemInstructionText.trim().length > 0) {
    config.systemInstruction = { parts: [{ text: systemInstructionText.trim() }] };
  }

  const rawTools = options.tools;
  const functionDeclarations = Array.isArray(rawTools)
    ? (rawTools as ToolDefinitionSpec[]).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }))
    : [];

  if (functionDeclarations.length > 0) {
    config.tools = [{ functionDeclarations }];
  } else if (options.enableWebSearch === true) {
    config.tools = [{ googleSearch: {} }];
  }

  return { contents, config };
}

export function normalizeGeminiFunctionCall(fc: GeminiFunctionCall): NormalizedToolCall {
  const name = fc.name || 'tool';
  const id = typeof fc.id === 'string' && fc.id.trim() ? fc.id.trim() : `gemini_${name}_${randomUUID()}`;
  return {
    id,
    name,
    argumentsJson: typeof fc.args === 'string' ? fc.args : JSON.stringify(fc.args ?? {}),
  };
}

export function pushGeminiToolCall(list: NormalizedToolCall[], fc: GeminiFunctionCall): void {
  const call = normalizeGeminiFunctionCall(fc);
  const providerId = typeof fc.id === 'string' && fc.id.trim().length > 0;
  if (providerId && list.some((existing) => existing.id === call.id)) return;
  if (!providerId && list.some((existing) => existing.name === call.name && existing.argumentsJson === call.argumentsJson)) {
    return;
  }
  list.push(call);
}
