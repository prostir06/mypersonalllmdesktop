import {
  toolRegistry,
  ToolRegistry,
  evaluateSafeMathExpression,
} from '../services/tools/registry';
import {
  ToolValidationError,
  ToolExecutionContext,
} from '../services/tools/types';
import prisma from '../config/prisma';
import EmbeddingService from '../services/EmbeddingService';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    document: {
      findMany: jest.fn(),
    },
    userMemoryNote: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    conversationNote: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    conversationMemoryNote: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn().mockResolvedValue({ id: 10, userId: 42 }),
      findUnique: jest.fn().mockResolvedValue({ id: 10, userId: 42 }),
      update: jest.fn(),
    },
    userSettings: {
      findUnique: jest.fn().mockResolvedValue({
        userId: 42,
        defaultProvider: 'openai',
        defaultModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000,
        systemPrompt: '',
      }),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
  prisma: {
    document: {
      findMany: jest.fn(),
    },
    userMemoryNote: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    conversationNote: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    conversationMemoryNote: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn().mockResolvedValue({ id: 10, userId: 42 }),
      findUnique: jest.fn().mockResolvedValue({ id: 10, userId: 42 }),
      update: jest.fn(),
    },
    userSettings: {
      findUnique: jest.fn().mockResolvedValue({
        userId: 42,
        defaultProvider: 'openai',
        defaultModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000,
        systemPrompt: '',
      }),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../services/EmbeddingService', () => ({
  __esModule: true,
  default: {
    findRelevantChunks: jest.fn(),
    generateEmbedding: jest.fn(),
  },
}));

describe('ToolRegistry', () => {
  const ctx: ToolExecutionContext = {
    userId: 42,
    conversationId: 101,
    model: 'gpt-4o',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Registry structure & definitions', () => {
    it('registers exactly 9 built-in tools by default', () => {
      const tools = toolRegistry.getAll();
      expect(tools).toHaveLength(9);

      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'add_conversation_note',
        'add_user_memory_note',
        'calculate',
        'get_current_time',
        'get_system_help',
        'list_documents',
        'read_memory',
        'search_documents',
        'update_settings',
      ]);
    });

    it('generates valid ToolDefinitionSpec list for providers', () => {
      const defs = toolRegistry.getDefinitions();
      expect(defs).toHaveLength(9);
      for (const def of defs) {
        expect(typeof def.name).toBe('string');
        expect(typeof def.description).toBe('string');
        expect(def.parameters).toBeDefined();
        expect(typeof def.parameters).toBe('object');
      }
    });

    it('allows registering and getting a custom tool in a new instance', () => {
      const customRegistry = new ToolRegistry(false);
      expect(customRegistry.getAll()).toHaveLength(0);

      customRegistry.register({
        name: 'custom_tool',
        description: 'Test custom tool',
        category: 'read',
        parameters: { type: 'object' },
        execute: async () => 'custom-result',
      });

      expect(customRegistry.get('custom_tool')).toBeDefined();
      expect(customRegistry.getAll()).toHaveLength(1);
    });
  });

  describe('Read Tools', () => {
    describe('search_documents', () => {
      const searchTool = toolRegistry.get('search_documents')!;

      it('has category "read"', () => {
        expect(searchTool.category).toBe('read');
      });

      it('calls EmbeddingService.findRelevantChunks with userId and limit and returns formatted snippets + sources', async () => {
        (EmbeddingService.generateEmbedding as jest.Mock).mockResolvedValue([0.1, 0.2]);
        (EmbeddingService.findRelevantChunks as jest.Mock).mockResolvedValue([
          { content: 'Chunk text 1', filename: 'report.pdf', similarity: 0.88 },
          { content: 'Chunk text 2', filename: 'notes.txt', similarity: 0.75 },
        ]);

        const result = await searchTool.execute(
          { query: 'financial report', limit: 3 },
          ctx
        );

        expect(EmbeddingService.findRelevantChunks).toHaveBeenCalledWith(
          [0.1, 0.2],
          ctx.userId,
          [],
          3,
          {}, null,
          'financial report'
        );
        expect(result.count).toBe(2);
        expect(result.snippets).toContain('[report.pdf] Chunk text 1');
        expect(result.snippets).toContain('[notes.txt] Chunk text 2');
        expect(result.sources).toEqual([
          { filename: 'report.pdf', similarity: 0.88 },
          { filename: 'notes.txt', similarity: 0.75 },
        ]);
      });

      it('defaults limit to 5 when not provided', async () => {
        (EmbeddingService.generateEmbedding as jest.Mock).mockResolvedValue([0.1, 0.2]);
        (EmbeddingService.findRelevantChunks as jest.Mock).mockResolvedValue([]);

        await searchTool.execute({ query: 'contracts' }, ctx);

        expect(EmbeddingService.findRelevantChunks).toHaveBeenCalledWith(
          [0.1, 0.2],
          ctx.userId,
          [],
          5,
          {}, null,
          'contracts'
        );
      });

      it('rejects empty query with ToolValidationError', async () => {
        await expect(searchTool.execute({ query: '' }, ctx)).rejects.toThrow(
          ToolValidationError
        );
        await expect(searchTool.execute({}, ctx)).rejects.toThrow(
          ToolValidationError
        );
      });

      it('rejects out of bounds limit with ToolValidationError', async () => {
        await expect(
          searchTool.execute({ query: 'test', limit: 0 }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          searchTool.execute({ query: 'test', limit: 11 }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          searchTool.execute({ query: 'test', limit: 2.5 }, ctx)
        ).rejects.toThrow(ToolValidationError);
      });
    });

    describe('list_documents', () => {
      const listTool = toolRegistry.get('list_documents')!;

      it('has category "read"', () => {
        expect(listTool.category).toBe('read');
      });

      it('queries prisma.document.findMany with userId and ready status', async () => {
        const mockDocs = [
          {
            id: 1,
            filename: 'doc1.pdf',
            fileType: 'pdf',
            fileSize: 1024,
            createdAt: new Date(),
          },
        ];
        (prisma.document.findMany as jest.Mock).mockResolvedValue(mockDocs);

        const result = await listTool.execute({ limit: 10 }, ctx);

        expect(prisma.document.findMany).toHaveBeenCalledWith({
          where: { userId: ctx.userId, status: 'ready' },
          take: 10,
          select: {
            id: true,
            filename: true,
            fileType: true,
            fileSize: true,
            createdAt: true,
          },
        });
        expect(result).toEqual(mockDocs);
      });

      it('defaults limit to 20', async () => {
        (prisma.document.findMany as jest.Mock).mockResolvedValue([]);

        await listTool.execute({}, ctx);

        expect(prisma.document.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ take: 20 })
        );
      });

      it('rejects invalid limit with ToolValidationError', async () => {
        await expect(listTool.execute({ limit: 0 }, ctx)).rejects.toThrow(
          ToolValidationError
        );
        await expect(listTool.execute({ limit: 51 }, ctx)).rejects.toThrow(
          ToolValidationError
        );
      });
    });

    describe('read_memory', () => {
      const memoryTool = toolRegistry.get('read_memory')!;

      it('has category "read"', () => {
        expect(memoryTool.category).toBe('read');
      });

      it('returns user notes and conversation notes when include_conversation is true', async () => {
        const userNotes = [{ id: 1, content: 'User prefers concise answers' }];
        const convNotes = [{ id: 2, content: 'Discussing project evolution' }];
        ((prisma as any).userMemoryNote.findMany as jest.Mock).mockResolvedValue(
          userNotes
        );
        ((prisma as any).conversationNote.findMany as jest.Mock).mockResolvedValue(
          convNotes
        );

        const result = await memoryTool.execute(
          { include_conversation: true },
          ctx
        );

        expect((prisma as any).userMemoryNote.findMany).toHaveBeenCalledWith({
          where: { userId: ctx.userId },
          orderBy: { createdAt: 'asc' },
        });
        expect(
          (prisma as any).conversationNote.findMany
        ).toHaveBeenCalledWith({
          where: { conversationId: ctx.conversationId },
          orderBy: { createdAt: 'asc' },
        });
        expect(result).toEqual({ userNotes, conversationNotes: convNotes });
      });

      it('omits conversation notes if include_conversation is false', async () => {
        ((prisma as any).userMemoryNote.findMany as jest.Mock).mockResolvedValue([]);

        const result = await memoryTool.execute(
          { include_conversation: false },
          ctx
        );

        expect(
          (prisma as any).conversationNote.findMany
        ).not.toHaveBeenCalled();
        expect(result.conversationNotes).toEqual([]);
      });

      it('rejects invalid include_conversation type with ToolValidationError', async () => {
        await expect(
          memoryTool.execute({ include_conversation: 'yes' }, ctx)
        ).rejects.toThrow(ToolValidationError);
      });
    });

    describe('get_system_help', () => {
      const helpTool = toolRegistry.get('get_system_help')!;

      it('has category "read"', () => {
        expect(helpTool.category).toBe('read');
      });

      it('returns matched cards for a valid query', async () => {
        const result = await helpTool.execute({ query: 'RAG search documents' }, ctx);
        expect(result.query).toBe('RAG search documents');
        expect(Array.isArray(result.matchedCards)).toBe(true);
      });

      it('rejects empty query with ToolValidationError', async () => {
        await expect(helpTool.execute({ query: '' }, ctx)).rejects.toThrow(
          ToolValidationError
        );
        await expect(helpTool.execute({}, ctx)).rejects.toThrow(
          ToolValidationError
        );
      });
    });

    describe('calculate (safe arithmetic)', () => {
      const calcTool = toolRegistry.get('calculate')!;

      it('has category "read"', () => {
        expect(calcTool.category).toBe('read');
      });

      it('evaluates basic math and parentheses correctly', async () => {
        const r1 = await calcTool.execute({ expression: '(150 * 1.2) / 4' }, ctx);
        expect(r1.result).toBe(45);

        const r2 = await calcTool.execute({ expression: '2 + 3 * 4' }, ctx);
        expect(r2.result).toBe(14);

        const r3 = await calcTool.execute({ expression: '(2 + 3) * 4' }, ctx);
        expect(r3.result).toBe(20);
      });

      it('evaluates exponentiation, modulo, and decimals', async () => {
        const r1 = await calcTool.execute({ expression: '2 ^ 3 ^ 2' }, ctx);
        expect(r1.result).toBe(512); // right-associative 2^(3^2)

        const r2 = await calcTool.execute({ expression: '10 % 3' }, ctx);
        expect(r2.result).toBe(1);

        const r3 = await calcTool.execute({ expression: '0.25 * 4' }, ctx);
        expect(r3.result).toBe(1);
      });

      it('handles unary minus and negative numbers correctly', async () => {
        const r1 = await calcTool.execute({ expression: '-5 + 10' }, ctx);
        expect(r1.result).toBe(5);

        const r2 = await calcTool.execute({ expression: '-(2 + 3) * 2' }, ctx);
        expect(r2.result).toBe(-10);
      });

      it('throws ToolValidationError on division by zero', async () => {
        await expect(
          calcTool.execute({ expression: '10 / 0' }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          calcTool.execute({ expression: '10 % 0' }, ctx)
        ).rejects.toThrow(ToolValidationError);
      });

      it('strictly rejects malicious strings, eval, letters, and injections', async () => {
        await expect(
          calcTool.execute({ expression: 'eval("1+1")' }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          calcTool.execute({ expression: 'process.exit(1)' }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          calcTool.execute({ expression: 'console.log(1)' }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          calcTool.execute({ expression: '2 + a' }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          calcTool.execute({ expression: '__proto__' }, ctx)
        ).rejects.toThrow(ToolValidationError);
      });

      it('strictly rejects syntax errors and unmatched parentheses', async () => {
        await expect(
          calcTool.execute({ expression: '2 +' }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          calcTool.execute({ expression: '((2 + 3)' }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          calcTool.execute({ expression: '2 + 3)' }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          calcTool.execute({ expression: '1.2.3' }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(calcTool.execute({ expression: '' }, ctx)).rejects.toThrow(
          ToolValidationError
        );
      });
    });

    describe('get_current_time', () => {
      const timeTool = toolRegistry.get('get_current_time')!;

      it('has category "read"', () => {
        expect(timeTool.category).toBe('read');
      });

      it('returns iso, local string, and timezone for Europe/Kyiv by default', async () => {
        const result = await timeTool.execute({}, ctx);
        expect(result.timezone).toBe('Europe/Kyiv');
        expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(typeof result.local).toBe('string');
      });

      it('accepts valid custom timezone like UTC', async () => {
        const result = await timeTool.execute({ timezone: 'UTC' }, ctx);
        expect(result.timezone).toBe('UTC');
      });

      it('rejects invalid timezone with ToolValidationError', async () => {
        await expect(
          timeTool.execute({ timezone: 'Mars/Phobos' }, ctx)
        ).rejects.toThrow(ToolValidationError);
      });
    });
  });

  describe('Write Tools (confirmation-gated)', () => {
    describe('add_user_memory_note', () => {
      const noteTool = toolRegistry.get('add_user_memory_note')!;

      it('has category "write"', () => {
        expect(noteTool.category).toBe('write');
      });

      it('describes proposal in Ukrainian', async () => {
        expect(noteTool.describeProposal).toBeDefined();
        const desc = await noteTool.describeProposal!({
          content: 'Користувач любить каву',
        }, ctx);
        expect(desc).toEqual({
          title: 'Додати довготривалу нотатку',
          summary: 'Зберегти в пам\'ять: "Користувач любить каву"',
        });
      });

      it('creates user memory note with userMemoryService.createNote', async () => {
        const mockCreated = { id: 10, userId: ctx.userId, content: 'Important note' };
        ((prisma as any).userMemoryNote.create as jest.Mock).mockResolvedValue(
          mockCreated
        );

        const result = await noteTool.execute(
          { content: '  Important note  ' },
          ctx
        );

        expect((prisma as any).userMemoryNote.create).toHaveBeenCalledWith({
          data: {
            userId: ctx.userId,
            content: 'Important note',
          },
        });
        expect(result).toEqual(mockCreated);
      });

      it('validates content bounds', async () => {
        await expect(noteTool.execute({ content: '' }, ctx)).rejects.toThrow(
          ToolValidationError
        );
        await expect(
          noteTool.execute({ content: 'a'.repeat(501) }, ctx)
        ).rejects.toThrow(ToolValidationError);
      });
    });

    describe('add_conversation_note', () => {
      const convNoteTool = toolRegistry.get('add_conversation_note')!;

      it('has category "write"', () => {
        expect(convNoteTool.category).toBe('write');
      });

      it('describes proposal in Ukrainian', async () => {
        expect(convNoteTool.describeProposal).toBeDefined();
        const desc = await convNoteTool.describeProposal!({
          content: 'Підсумок зустрічі',
        }, ctx);
        expect(desc).toEqual({
          title: 'Додати нотатку до розмови',
          summary: 'Зберегти в розмову: "Підсумок зустрічі"',
        });
      });

      it('requires conversationId in execution context', async () => {
        const ctxWithoutConv: ToolExecutionContext = { userId: 42 };
        await expect(
          convNoteTool.execute({ content: 'Some note' }, ctxWithoutConv)
        ).rejects.toThrow(ToolValidationError);
      });

      it('creates conversation note via conversationMemoryService', async () => {
        const mockCreated = {
          id: 5,
          conversationId: ctx.conversationId,
          content: 'Session note',
        };
        ((prisma as any).conversationMemoryNote.create as jest.Mock).mockResolvedValue(
          mockCreated
        );

        const result = await convNoteTool.execute(
          { content: 'Session note' },
          ctx
        );

        expect((prisma as any).conversationMemoryNote.create).toHaveBeenCalledWith({
          data: {
            conversationId: ctx.conversationId,
            content: 'Session note',
          },
        });
        expect(result).toEqual(mockCreated);
      });

      it('validates content bounds', async () => {
        await expect(
          convNoteTool.execute({ content: '' }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          convNoteTool.execute({ content: 'x'.repeat(501) }, ctx)
        ).rejects.toThrow(ToolValidationError);
      });
    });

    describe('update_settings', () => {
      const settingsTool = toolRegistry.get('update_settings')!;

      it('has category "write"', () => {
        expect(settingsTool.category).toBe('write');
      });

      it('describes proposal in Ukrainian with formatted fields', async () => {
        expect(settingsTool.describeProposal).toBeDefined();
        const desc = await settingsTool.describeProposal!({
          temperature: 0.8,
          max_tokens: 4000,
          default_model: 'gpt-4o',
        }, ctx);
        expect(desc.title).toBe('Оновити налаштування');
        expect(desc.summary).toContain('Оновити налаштування: змінити');
        expect(desc.summary).toContain('температуру на 0.8');
        expect(desc.summary).toContain('максимальну кількість токенів на 4000');
        expect(desc.summary).toContain('модель за замовчуванням на "gpt-4o"');
        expect(desc.diff).toBeDefined();
      });

      it('updates user settings in prisma', async () => {
        const mockUpdated = {
          id: 1,
          userId: ctx.userId,
          temperature: 0.5,
          maxTokens: 3000,
          defaultModel: 'gpt-4o-mini',
        };
        ((prisma.userSettings.upsert || prisma.userSettings.update) as jest.Mock).mockResolvedValue(mockUpdated);

        const result = await settingsTool.execute(
          {
            temperature: 0.5,
            max_tokens: 3000,
            default_model: 'gpt-4o-mini',
          },
          ctx
        );

        expect((prisma.userSettings as any).upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { userId: ctx.userId },
            update: expect.objectContaining({
              temperature: 0.5,
              maxTokens: 3000,
              defaultModel: 'gpt-4o-mini',
            }),
          })
        );
        expect(result).toMatchObject({ user_id: ctx.userId, temperature: 0.5, max_tokens: 3000, default_model: 'gpt-4o-mini' });
      });

      it('rejects execution when no setting fields are provided', async () => {
        await expect(settingsTool.execute({}, ctx)).rejects.toThrow(
          ToolValidationError
        );
      });

      it('rejects invalid temperature bounds', async () => {
        await expect(
          settingsTool.execute({ temperature: -0.1 }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          settingsTool.execute({ temperature: 2.1 }, ctx)
        ).rejects.toThrow(ToolValidationError);
      });

      it('rejects invalid max_tokens bounds', async () => {
        await expect(
          settingsTool.execute({ max_tokens: 50 }, ctx)
        ).rejects.toThrow(ToolValidationError);
        await expect(
          settingsTool.execute({ max_tokens: 9000 }, ctx)
        ).rejects.toThrow(ToolValidationError);
      });

      it('rejects empty default_model', async () => {
        await expect(
          settingsTool.execute({ default_model: '   ' }, ctx)
        ).rejects.toThrow(ToolValidationError);
      });
    });
  });
});
