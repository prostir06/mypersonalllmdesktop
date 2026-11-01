import type { ToolDefinitionSpec } from '../providers/types';

export interface ToolExecutionContext {
  userId: number;
  conversationId?: number;
  model?: string;
  provider?: string;
  signal?: AbortSignal;
}

export class ToolValidationError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'ToolValidationError';
    this.statusCode = 400;
  }
}

export interface ToolProposal {
  title: string;
  summary: string;
  diff?: Record<string, { from: unknown; to: unknown }>;
}

export interface RegisteredTool<TArgs = Record<string, any>> {
  name: string;
  description: string;
  category: 'read' | 'write';
  parameters: Record<string, unknown>;
  execute: (args: TArgs, ctx: ToolExecutionContext) => Promise<any>;
  describeProposal?: (
    args: TArgs,
    ctx?: ToolExecutionContext
  ) => Promise<ToolProposal> | ToolProposal;
}

export interface ToolTraceEntry {
  tool: string;
  args: Record<string, unknown>;
  category: 'read' | 'write';
  result?: unknown;
  requiresConfirmation?: boolean;
  pendingActionId?: string;
  status: 'completed' | 'pending_confirmation' | 'rejected' | 'failed';
  durationMs: number;
  error?: string;
}

export type { ToolDefinitionSpec };
