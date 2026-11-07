import type { ToolDefinitionSpec } from '../providers/types';
import type { RegisteredTool } from './types';
import { builtInReadTools } from './builtInReadTools';
import { builtInWriteTools } from './builtInWriteTools';

export { evaluateSafeMathExpression } from './safeMath';

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  constructor(registerDefaults = true) {
    if (registerDefaults) this.registerBuiltInTools();
  }

  register(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
  }

  get<TArgs = Record<string, unknown>, TResult = Record<string, unknown>>(
    name: string
  ): RegisteredTool<TArgs, TResult> | undefined {
    if (!name || typeof name !== 'string') return undefined;
    const trimmed = name.trim();
    const exact = this.tools.get(trimmed);
    if (exact) return exact as unknown as RegisteredTool<TArgs, TResult>;
    // Resilient fallback for doubled names (e.g. calculatecalculate)
    if (trimmed.length > 2 && trimmed.length % 2 === 0) {
      const half = trimmed.slice(0, trimmed.length / 2);
      if (half + half === trimmed) {
        const fallback = this.tools.get(half);
        if (fallback) return fallback as unknown as RegisteredTool<TArgs, TResult>;
      }
    }
    return undefined;
  }

  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): ToolDefinitionSpec[] {
    return this.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  private registerBuiltInTools(): void {
    for (const tool of builtInReadTools) {
      this.register(tool);
    }
    for (const tool of builtInWriteTools) {
      this.register(tool);
    }
  }
}

export const toolRegistry = new ToolRegistry();
export default toolRegistry;
