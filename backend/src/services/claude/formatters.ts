import Anthropic from '@anthropic-ai/sdk';
import logger from '../../logger';
import { buildTokenUsage } from '../providers/shared';
import { defaultAnthropicModel } from '../../config/models';
import type { TokenUsage } from '../chat/types';

export type ClaudeImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

export function normalizeMediaType(mime: string): ClaudeImageMediaType {
  const lower = mime.toLowerCase();
  if (lower === 'image/jpg' || lower === 'image/jpeg') return 'image/jpeg';
  if (lower === 'image/png') return 'image/png';
  if (lower === 'image/gif') return 'image/gif';
  if (lower === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

export function formatClaudeTokenUsage(
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  },
  model?: string
): TokenUsage | undefined {
  if (!usage) return undefined;
  return buildTokenUsage(
    usage.input_tokens ?? 0,
    usage.output_tokens ?? 0,
    model || defaultAnthropicModel()
  );
}

export type ClaudeMessageInput = {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  id?: string;
  tool_calls?: Array<{
    id?: string;
    name?: string;
    argumentsJson?: string | Record<string, unknown>;
    function?: { name?: string; arguments?: string | Record<string, unknown> };
  }>;
};

export function formatClaudeMessages(
  messages: ClaudeMessageInput[],
  options: Record<string, unknown> = {}
): {
  messages: Anthropic.Messages.MessageParam[];
  system?: string;
} {
  let systemInstructionText = '';
  const formatted: Anthropic.Messages.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemInstructionText +=
          (systemInstructionText ? '\n\n' : '') + msg.content.trim();
      }
      continue;
    }

    if (msg.role === 'tool') {
      const toolUseId = msg.tool_call_id || msg.id || 'tool_call';
      const rawContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? {});
      const toolResultBlock: Anthropic.Messages.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: rawContent,
      };
      if (formatted.length > 0 && formatted[formatted.length - 1].role === 'user') {
        const prev = formatted[formatted.length - 1];
        if (Array.isArray(prev.content)) {
          (prev.content as Anthropic.Messages.ContentBlockParam[]).push(toolResultBlock);
        } else {
          prev.content = [{ type: 'text', text: String(prev.content) }, toolResultBlock];
        }
      } else {
        formatted.push({ role: 'user', content: [toolResultBlock] });
      }
      continue;
    }

    const role: 'user' | 'assistant' =
      msg.role === 'assistant' ? 'assistant' : 'user';
    const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

    if (typeof msg.content === 'string') {
      if (msg.content.length > 0) {
        contentBlocks.push({ type: 'text', text: msg.content });
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<{
        type?: string;
        text?: string;
        image_url?: { url?: string };
      }>) {
        if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
          contentBlocks.push({ type: 'text', text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: normalizeMediaType(match[1]),
                data: match[2],
              },
            });
          }
        }
      }
    }

    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        let input: Record<string, unknown>;
        try {
          input = typeof tc.function?.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : (tc.function?.arguments ?? (typeof tc.argumentsJson === 'string' ? JSON.parse(tc.argumentsJson) : (tc.argumentsJson || {})));
        } catch (err: unknown) {
          logger.warn(
            `Failed to parse Claude assistant tool_calls arguments for tool "${tc.function?.name || tc.name}": ${err instanceof Error ? err.message : String(err)}`
          );
          input = {};
        }
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id || tc.function?.name || 'tool_use',
          name: tc.function?.name || tc.name || '',
          input,
        });
      }
    }

    if (contentBlocks.length === 0) {
      continue;
    }

    // Merge consecutive messages of the same role to satisfy Anthropic alternating turn requirement
    if (formatted.length > 0 && formatted[formatted.length - 1].role === role) {
      const prev = formatted[formatted.length - 1];
      const prevBlocks: Anthropic.Messages.ContentBlockParam[] = Array.isArray(
        prev.content
      )
        ? (prev.content as Anthropic.Messages.ContentBlockParam[])
        : [{ type: 'text', text: String(prev.content) }];
      prev.content = [...prevBlocks, ...contentBlocks];
    } else {
      formatted.push({
        role,
        content: contentBlocks,
      });
    }
  }

  // If options.image is present and not already in messages, append to the last user message (or create one)
  if (typeof options.image === 'string') {
    const match = options.image.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const imageBlock: Anthropic.Messages.ImageBlockParam = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: normalizeMediaType(match[1]),
          data: match[2],
        },
      };

      const lastMsg = formatted[formatted.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
        const currentBlocks = Array.isArray(lastMsg.content)
          ? (lastMsg.content as Anthropic.Messages.ContentBlockParam[])
          : [{ type: 'text' as const, text: String(lastMsg.content) }];
        lastMsg.content = [...currentBlocks, imageBlock];
      } else {
        formatted.push({
          role: 'user',
          content: [imageBlock],
        });
      }
    }
  }

  return {
    messages: formatted,
    ...(systemInstructionText ? { system: systemInstructionText } : {}),
  };
}
