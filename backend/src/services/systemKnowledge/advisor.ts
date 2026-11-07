import prisma from '../../config/prisma';
import { resolveEmbeddingContext } from '../embeddings/resolveEmbeddingContext';
import { embeddingContextToRagMode } from '../embeddings/types';
import type { EmbeddingProviderName } from '../embeddings/types';
import { modelSupportsVision } from '../../utils/modelCapabilities';
import { defaultModelFor } from '../../config/models';
import { envOpenAiKey } from '../../utils/openaiKeyResolver';
import { envGeminiKey } from '../../utils/geminiKeyResolver';
import { envClaudeKey } from '../../utils/claudeKeyResolver';
import { numTemp } from '../../utils/numTemp';
import { resolveWebSearchBackend } from '../webSearch';
import type { AdvisoryTip, UserSystemSnapshot } from './types';

export interface SnapshotOverrides {
  provider?: string;
  model?: string;
  selectedDocCount?: number;
  webSearchEnabled?: boolean;
  toolsEnabled?: boolean;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
};

const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434/v1/chat/completions';

function statusCounts(
  groups: Array<{ status: string; _count: { _all: number } }>
): { total: number; ready: number; pending: number; failed: number } {
  let total = 0;
  let ready = 0;
  let pending = 0;
  let failed = 0;
  for (const group of groups) {
    const count = group._count._all;
    total += count;
    if (group.status === 'ready') ready += count;
    else if (group.status === 'pending') pending += count;
    else if (group.status === 'failed') failed += count;
  }
  return { total, ready, pending, failed };
}

function needsReindexWhere(userId: number, provider: EmbeddingProviderName) {
  if (provider === 'none') {
    return { userId, status: 'ready' as const, embeddingsCount: 0 };
  }
  return {
    userId,
    status: 'ready' as const,
    OR: [
      { embeddingsCount: 0 },
      { embeddingProvider: null },
      { embeddingProvider: { not: provider } },
    ],
  };
}

export async function buildUserSystemSnapshot(
  userId: number,
  overrides?: SnapshotOverrides
): Promise<UserSystemSnapshot> {
  const [userSettings, statusGroups, embedCtx, pinnedPromptsCount, userMemoryNotesCount] =
    await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.document.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
      resolveEmbeddingContext(userId),
      prisma.userPrompt.count({ where: { userId, isPinned: true } }),
      prisma.userMemoryNote.count({ where: { userId } }),
    ]);
  const needsReindexDocs = await prisma.document.count({
    where: needsReindexWhere(userId, embedCtx.provider),
  });

  const defaultProvider = userSettings?.defaultProvider || 'openai';
  const defaultModel = userSettings?.defaultModel || defaultModelFor(defaultProvider);
  const defaultOllamaHost =
    userSettings?.defaultOllamaHost || DEFAULT_OLLAMA_HOST;

  const configuredProviders = {
    openai:
      Boolean(
        userSettings?.openaiApiKeyEnc && userSettings.openaiApiKeyEnc.trim()
      ) || Boolean(envOpenAiKey()),
    gemini:
      Boolean(
        userSettings?.geminiApiKeyEnc && userSettings.geminiApiKeyEnc.trim()
      ) || Boolean(envGeminiKey()),
    anthropic:
      Boolean(
        userSettings?.anthropicApiKeyEnc &&
          userSettings.anthropicApiKeyEnc.trim()
      ) || Boolean(envClaudeKey()),
    ollamaHost: defaultOllamaHost,
  };

  const ragEmbeddingMode = embeddingContextToRagMode(embedCtx);

  const { total: totalDocs, ready: readyDocs, pending: pendingDocs, failed: failedDocs } =
    statusCounts(statusGroups);

  const activeProvider = overrides?.provider || defaultProvider;
  const activeModel = overrides?.model || defaultModel;

  const toolsEnabled =
    overrides?.toolsEnabled !== undefined
      ? overrides.toolsEnabled
      : (userSettings?.toolsEnabled ?? true);

  const webSearchBackend: 'gemini_grounding' | 'tavily' | 'searxng' | 'none' =
    activeProvider === 'gemini'
      ? 'gemini_grounding'
      : resolveWebSearchBackend();

  return {
    activeProvider,
    activeModel,
    modelSupportsVision: modelSupportsVision(activeModel),
    modelSupportsWebSearch: activeProvider === 'gemini' || resolveWebSearchBackend() !== 'none',
    webSearchEnabled: Boolean(overrides?.webSearchEnabled),
    toolsEnabled,
    webSearchBackend,
    configuredProviders,
    ragEmbeddingMode,
    documents: {
      total: totalDocs,
      ready: readyDocs,
      pending: pendingDocs,
      failed: failedDocs,
      needsReindex: needsReindexDocs,
      selectedInChat: overrides?.selectedDocCount ?? 0,
    },
    hasCustomSystemPrompt: Boolean(
      userSettings?.systemPrompt && userSettings.systemPrompt.trim().length > 0
    ),
    pinnedPromptsCount,
    userMemoryNotesCount,
    temperature: numTemp(userSettings?.temperature),
    maxTokens: userSettings?.maxTokens || 4096,
  };
}

export function evaluateSystemAdvisories(
  snapshot: UserSystemSnapshot
): AdvisoryTip[] {
  const advisories: AdvisoryTip[] = [];

  // 1. missing-provider-key (warning, providers)
  if (
    ['openai', 'gemini', 'anthropic'].includes(snapshot.activeProvider) &&
    !snapshot.configuredProviders[
      snapshot.activeProvider as keyof typeof snapshot.configuredProviders
    ]
  ) {
    const providerName =
      PROVIDER_DISPLAY_NAMES[snapshot.activeProvider] ||
      snapshot.activeProvider;
    advisories.push({
      id: 'missing-provider-key',
      severity: 'warning',
      category: 'providers',
      title: 'Не налаштовано API-ключ для активного провайдера',
      message: `Для надсилання запитів через ${providerName} додайте власний API-ключ у налаштуваннях.`,
      actionLabel: 'Налаштувати ключ',
      actionType: 'navigate_settings',
      actionTarget: '/settings?tab=api-keys',
    });
  }

  // 2. documents-failed (warning, rag)
  if (snapshot.documents.failed > 0) {
    advisories.push({
      id: 'documents-failed',
      severity: 'warning',
      category: 'rag',
      title: 'Помилка індексації документів',
      message: `У вас є ${snapshot.documents.failed} документ(ів) із помилкою індексації. Ви можете повторити спробу в модальному вікні документів.`,
      actionLabel: 'Переглянути документи',
      actionType: 'open_documents',
    });
  }

  // 3. documents-needs-reindex (warning, rag)
  if (snapshot.documents.needsReindex > 0) {
    advisories.push({
      id: 'documents-needs-reindex',
      severity: 'warning',
      category: 'rag',
      title: 'Потрібна переіндексація документів',
      message: `${snapshot.documents.needsReindex} документ(ів) потребує переіндексації під поточний режим RAG (${snapshot.ragEmbeddingMode}).`,
      actionLabel: 'Переіндексувати',
      actionType: 'open_documents',
    });
  }

  // 4. rag-fallback-mode (warning, rag)
  if (
    snapshot.documents.ready > 0 &&
    snapshot.ragEmbeddingMode === 'fallback'
  ) {
    advisories.push({
      id: 'rag-fallback-mode',
      severity: 'warning',
      category: 'rag',
      title: 'RAG працює у спрощеному режимі',
      message:
        'Семантичний векторний пошук недоступний без OpenAI ключа або локальної Ollama моделі nomic-embed-text. Працює лише текстовий пошук.',
      actionLabel: 'Додати ключ або Ollama',
      actionType: 'navigate_settings',
      actionTarget: '/settings?tab=api-keys',
    });
  }

  // 5. rag-docs-unselected (info, rag)
  if (
    snapshot.documents.ready > 0 &&
    snapshot.documents.selectedInChat === 0
  ) {
    advisories.push({
      id: 'rag-docs-unselected',
      severity: 'info',
      category: 'rag',
      title: 'Документи готові до використання',
      message: `У вас є ${snapshot.documents.ready} готових документ(ів). Щоб асистент враховував їх у відповідях, оберіть їх кнопкою «📎 Документи» у панелі чату.`,
      actionLabel: 'Обрати документи',
      actionType: 'open_documents',
    });
  }

  // 6. web-search-hint (info, chat_tools)
  if (snapshot.activeProvider === 'gemini' && !snapshot.webSearchEnabled) {
    advisories.push({
      id: 'web-search-hint',
      severity: 'info',
      category: 'chat_tools',
      title: 'Доступний пошук в інтернеті',
      message:
        'Google Gemini підтримує пошук в інтернеті в реальному часі. Ви можете увімкнути його перемикачем «🌐 Пошук» над полем вводу.',
      actionLabel: 'Дізнатися більше',
      actionType: 'ask_ai',
      suggestedPrompt:
        'Розкажи, як працює пошук в інтернеті у Gemini та які джерела ти використовуєш?',
    });
  }

  // 7. web-search-no-backend (warning, chat_tools)
  if (
    snapshot.webSearchEnabled &&
    snapshot.activeProvider !== 'gemini' &&
    snapshot.webSearchBackend === 'none'
  ) {
    advisories.push({
      id: 'web-search-no-backend',
      severity: 'warning',
      category: 'chat_tools',
      title: 'Веб-пошук увімкнено, але бекенд не налаштовано',
      message:
        'Для використання універсального веб-пошуку потрібен запущений сервіс SearXNG або валідний ключ TAVILY_API_KEY.',
      actionLabel: 'Налаштувати ключі',
      actionType: 'navigate_settings',
      actionTarget: '/settings?tab=api-keys',
    });
  }

  // 8. tools-confirmation-guidance (info, chat_tools)
  if (snapshot.toolsEnabled !== false) {
    advisories.push({
      id: 'tools-confirmation-guidance',
      severity: 'info',
      category: 'chat_tools',
      title: 'Автономні інструменти та безпека дій',
      message:
        'Асистент може виконувати читання (пошук, калькулятор, веб-пошук) автономно, а операції запису (зміна налаштувань, нотатки в пам’ять) вимагають обов’язкового підтвердження (Human-in-the-loop).',
      actionLabel: 'Дізнатися про інструменти',
      actionType: 'ask_ai',
      suggestedPrompt:
        'Які автономні інструменти тобі доступні та як працює підтвердження змін?',
    });
  }

  // 7. personalization-onboarding (info, settings)
  if (
    !snapshot.hasCustomSystemPrompt &&
    snapshot.userMemoryNotesCount === 0 &&
    snapshot.pinnedPromptsCount === 0
  ) {
    advisories.push({
      id: 'personalization-onboarding',
      severity: 'info',
      category: 'settings',
      title: 'Персоналізуйте відповіді асистента',
      message:
        'Ви можете налаштувати постійні правила у «Системній ролі», зберегти важливі факти про себе в «Пам\'яті» або закріпити шаблони в «Бібліотеці промптів».',
      actionLabel: 'Налаштувати персоналізацію',
      actionType: 'navigate_settings',
      actionTarget: '/settings?tab=memory',
    });
  }

  return advisories;
}
