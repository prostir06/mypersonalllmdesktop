const mockPrisma = {
  userSettings: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  message: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  conversation: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  pendingToolAction: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

mockPrisma.$transaction.mockImplementation(async (callback: any) => {
  return callback(mockPrisma);
});

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

const mockProviderFactory = {
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
};

jest.mock('../services/providerFactory', () => ({
  __esModule: true,
  default: mockProviderFactory,
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import {
  runToolOrchestratedTurn,
  resolvePendingToolAction,
  MAX_TOOL_ITERATIONS,
  TOOL_TIMEOUT_MS,
  MAX_TOOL_OUTPUT_CHARS,
  PENDING_ACTION_TTL_MS,
} from '../services/tools/orchestrator';
import toolRegistry from '../services/tools/registry';
import { ChatError } from '../services/chat/types';

describe('ToolOrchestrator', () => {
  let createdAssistantId = 100;

  beforeEach(() => {
    jest.clearAllMocks();
    createdAssistantId = 100;
    mockPrisma.message.create.mockImplementation(async (args: any) => ({
      id: ++createdAssistantId,
      createdAt: new Date(),
      ...args.data,
    }));
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 1,
      title: 'Test Conv',
    });
    mockPrisma.conversation.update.mockResolvedValue({ id: 1 });
    mockPrisma.userSettings.findUnique.mockResolvedValue({ toolsEnabled: true });
  });

  describe('constants', () => {
    it('defines expected orchestrator constants', () => {
      expect(MAX_TOOL_ITERATIONS).toBe(5);
      expect(TOOL_TIMEOUT_MS).toBe(15000);
      expect(MAX_TOOL_OUTPUT_CHARS).toBe(4000);
      expect(PENDING_ACTION_TTL_MS).toBe(15 * 60 * 1000);
    });
  });

  describe('runToolOrchestratedTurn', () => {
    it('executes read tool loop, emits SSE events, and completes with final text', async () => {
      const sseWritten: string[] = [];
      const mockRes = {
        write: (str: string) => {
          sseWritten.push(str);
          return true;
        },
      };

      // Turn 1: model returns calculate tool call
      mockProviderFactory.sendMessage
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'calculate',
              argumentsJson: JSON.stringify({ expression: '15 * 4' }),
            },
          ],
        })
        // Turn 2: model sees result and returns final assistant response
        .mockResolvedValueOnce({
          content: 'Результат обчислення 15 * 4 = 60.',
          toolCalls: [],
        });

      const result = await runToolOrchestratedTurn({
        userId: 1,
        conversationId: 10,
        userMessage: 'Порахуй 15 * 4',
        chatMessages: [{ role: 'user', content: 'Порахуй 15 * 4' }],
        provider: 'openai',
        model: 'gpt-4o',
        res: mockRes,
      });

      expect(mockProviderFactory.sendMessage).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('Результат обчислення 15 * 4 = 60.');
      expect(result.toolTrace).toHaveLength(1);
      expect(result.toolTrace?.[0]).toMatchObject({
        tool: 'calculate',
        category: 'read',
        result: expect.objectContaining({ result: 60 }),
        status: 'completed',
      });

      // Verify SSE events were emitted
      const joinedEvents = sseWritten.join('\n');
      expect(joinedEvents).toContain('event: tool_call');
      expect(joinedEvents).toContain('"name":"calculate"');
      expect(joinedEvents).toContain('event: tool_result');
      expect(joinedEvents).toContain('"result":60');

      // Verify persisted turn includes toolTrace
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'assistant',
            content: 'Результат обчислення 15 * 4 = 60.',
            toolTrace: expect.arrayContaining([
              expect.objectContaining({ tool: 'calculate' }),
            ]),
          }),
        })
      );
    });

    it('enforces maximum 5 iterations guard and breaks cleanly', async () => {
      // Return a read tool call on every single call
      mockProviderFactory.sendMessage.mockResolvedValue({
        content: 'thinking...',
        toolCalls: [
          {
            id: 'call_loop',
            name: 'get_current_time',
            argumentsJson: '{}',
          },
        ],
      });

      const result = await runToolOrchestratedTurn({
        userId: 1,
        conversationId: 10,
        userMessage: 'loop test',
        chatMessages: [{ role: 'user', content: 'loop test' }],
        provider: 'openai',
        model: 'gpt-4o',
      });

      // Loop must stop exactly after MAX_TOOL_ITERATIONS (5) calls
      expect(mockProviderFactory.sendMessage).toHaveBeenCalledTimes(5);
      expect(result.toolTrace).toHaveLength(5);
    });

    it('truncates read tool output exceeding 4000 chars cleanly', async () => {
      // Register temporary large output tool
      toolRegistry.register({
        name: 'huge_output_tool',
        description: 'Returns large text',
        category: 'read',
        parameters: { type: 'object', properties: {} },
        execute: async () => 'A'.repeat(5000),
      });

      mockProviderFactory.sendMessage
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call_huge',
              name: 'huge_output_tool',
              argumentsJson: '{}',
            },
          ],
        })
        .mockResolvedValueOnce({
          content: 'Received truncated output',
          toolCalls: [],
        });

      const result = await runToolOrchestratedTurn({
        userId: 1,
        conversationId: 10,
        userMessage: 'give me huge text',
        chatMessages: [{ role: 'user', content: 'give me huge text' }],
        provider: 'openai',
        model: 'gpt-4o',
      });

      expect(mockProviderFactory.sendMessage).toHaveBeenCalledTimes(2);
      const secondCallMessages = mockProviderFactory.sendMessage.mock.calls[1][1];
      const toolMsg = secondCallMessages.find((m: any) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg.content.length).toBeLessThanOrEqual(4000 + '... [truncated]'.length);
      expect(toolMsg.content).toContain('... [truncated]');
      expect(result.content).toBe('Received truncated output');
    });

    it('pauses on write tools, creates PendingToolAction, emits tool_confirmation_required, and does NOT execute write tool', async () => {
      const sseWritten: string[] = [];
      const mockRes = {
        write: (str: string) => {
          sseWritten.push(str);
          return true;
        },
      };

      mockPrisma.pendingToolAction.create.mockResolvedValue({
        id: 'mock-action-uuid',
      });

      // Model returns a write tool call: add_user_memory_note
      mockProviderFactory.sendMessage.mockResolvedValueOnce({
        content: 'Я можу зберегти це у вашій памʼяті. Будь ласка, підтвердіть дію.',
        toolCalls: [
          {
            id: 'call_write_1',
            name: 'add_user_memory_note',
            argumentsJson: JSON.stringify({ content: 'Користувач любить каву без цукру' }),
          },
        ],
      });

      const result = await runToolOrchestratedTurn({
        userId: 2,
        conversationId: 20,
        userMessage: 'Запамʼятай, що я люблю каву без цукру',
        chatMessages: [{ role: 'user', content: 'Запамʼятай, що я люблю каву без цукру' }],
        provider: 'openai',
        model: 'gpt-4o',
        res: mockRes,
      });

      // Provider was only called once (paused turn)
      expect(mockProviderFactory.sendMessage).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('pending_confirmation');
      expect(result.toolTrace).toHaveLength(1);
      expect(result.toolTrace?.[0]).toMatchObject({
        tool: 'add_user_memory_note',
        category: 'write',
        requiresConfirmation: true,
        status: 'pending_confirmation',
      });

      // Pending action created in DB
      expect(mockPrisma.pendingToolAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 2,
          conversationId: 20,
          toolName: 'add_user_memory_note',
          toolArgs: { content: 'Користувач любить каву без цукру' },
          status: 'pending',
        }),
      });

      // SSE event emitted
      const joinedEvents = sseWritten.join('\n');
      expect(joinedEvents).toContain('event: tool_confirmation_required');
      expect(joinedEvents).toContain('"toolName":"add_user_memory_note"');
      expect(joinedEvents).toContain('Користувач любить каву без цукру');
    });

    it('falls back to non-tool flow when model does not support tools or tools are disabled', async () => {
      // Model llama2 does not support tools
      mockProviderFactory.sendMessage.mockResolvedValueOnce({
        content: 'Normal answer from llama2',
      });

      const result = await runToolOrchestratedTurn({
        userId: 1,
        conversationId: 10,
        userMessage: 'hi',
        chatMessages: [{ role: 'user', content: 'hi' }],
        provider: 'ollama',
        model: 'llama2',
      });

      expect(mockProviderFactory.sendMessage).toHaveBeenCalledWith(
        'ollama',
        [{ role: 'user', content: 'hi' }],
        'llama2',
        expect.not.objectContaining({ tools: expect.anything() })
      );
      expect(result.content).toBe('Normal answer from llama2');
      expect(result.toolTrace).toBeUndefined();
    });
  });

  describe('resolvePendingToolAction', () => {
    it('throws 404 when action does not exist', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue(null);
      await expect(
        resolvePendingToolAction('missing-id', 1, 'approve')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 403 when user is not the owner of the action', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'action-1',
        userId: 999, // different owner
        status: 'pending',
        expiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        resolvePendingToolAction('action-1', 1, 'approve')
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('throws 409 when action is not in pending status', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'action-1',
        userId: 1,
        status: 'approved',
        expiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        resolvePendingToolAction('action-1', 1, 'approve')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('throws 410 and updates status to expired when action is expired', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'action-1',
        userId: 1,
        status: 'pending',
        expiresAt: new Date(Date.now() - 60000), // expired 1 min ago
      });

      await expect(
        resolvePendingToolAction('action-1', 1, 'approve')
      ).rejects.toMatchObject({ statusCode: 410 });

      expect(mockPrisma.pendingToolAction.update).toHaveBeenCalledWith({
        where: { id: 'action-1' },
        data: { status: 'expired' },
      });
    });

    it('rejects action, updates DB and updates message tool_trace', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'act-reject',
        userId: 1,
        messageId: 50,
        status: 'pending',
        expiresAt: new Date(Date.now() + 60000),
      });
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 50,
        toolTrace: [
          {
            tool: 'add_user_memory_note',
            pendingActionId: 'act-reject',
            status: 'pending_confirmation',
          },
        ],
      });

      const res = await resolvePendingToolAction('act-reject', 1, 'reject');
      expect(res).toEqual({ success: true, status: 'rejected' });
      expect(mockPrisma.pendingToolAction.update).toHaveBeenCalledWith({
        where: { id: 'act-reject' },
        data: expect.objectContaining({
          status: 'rejected',
        }),
      });
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: 50 },
        data: {
          toolTrace: [
            expect.objectContaining({
              pendingActionId: 'act-reject',
              status: 'rejected',
            }),
          ],
        },
      });
    });

    it('approves action, executes tool, updates DB with resultSummary, and updates message tool_trace', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'act-approve',
        userId: 1,
        conversationId: 10,
        messageId: 55,
        toolName: 'add_user_memory_note',
        toolArgs: { content: 'Нотатка памяті' },
        status: 'pending',
        expiresAt: new Date(Date.now() + 60000),
      });
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 55,
        toolTrace: [
          {
            tool: 'add_user_memory_note',
            pendingActionId: 'act-approve',
            status: 'pending_confirmation',
          },
        ],
      });
      (mockPrisma as any).userMemoryNote = {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 99, content: 'Нотатка памяті' }),
      };

      const res = await resolvePendingToolAction('act-approve', 1, 'approve');
      expect(res.success).toBe(true);
      expect(res.status).toBe('approved');
      expect(res.result).toBeDefined();

      expect(mockPrisma.pendingToolAction.update).toHaveBeenCalledWith({
        where: { id: 'act-approve' },
        data: expect.objectContaining({
          status: 'approved',
          resultSummary: expect.any(String),
        }),
      });
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: 55 },
        data: {
          toolTrace: [
            expect.objectContaining({
              pendingActionId: 'act-approve',
              status: 'completed',
            }),
          ],
        },
      });
    });
  });
});
