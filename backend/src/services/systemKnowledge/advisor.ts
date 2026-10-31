import prisma from '../../config/prisma';
import { resolveEmbeddingContext } from '../embeddings/resolveEmbeddingContext';
import { embeddingContextToRagMode } from '../embeddings/types';
import { computeNeedsReindex } from '../documents/publicDocument';
import { modelSupportsVision } from '../../utils/modelCapabilities';
import { envOpenAiKey } from '../../utils/openaiKeyResolver';
import { envGeminiKey } from '../../utils/geminiKeyResolver';
import { envClaudeKey } from '../../utils/claudeKeyResolver';
import { numTemp } from '../../utils/numTemp';
import type { AdvisoryTip, UserSystemSnapshot } from './types';

export interface SnapshotOverrides {
  provider?: string;
  model?: string;
  selectedDocCount?: number;
  webSearchEnabled?: boolean;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
};

const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434/v1/chat/completions';

export async function buildUserSystemSnapshot(
  userId: number,
  overrides?: SnapshotOverrides
): Promise<UserSystemSnapshot> {
  const [userSettings, docs, embedCtx, pinnedPromptsCount, userMemoryNotesCount] =
    await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.document.findMany({
        where: { userId },
        select: {
          id: true,
          userId: true,
          filename: true,
          fileType: true,
          fileSize: true,
          status: true,
          failureReason: true,
          embeddingsCount: true,
          embeddingProvider: true,
          createdAt: true,
        },
      }),
      resolveEmbeddingContext(userId),
      prisma.userPrompt.count({ where: { userId, isPinned: true } }),
      prisma.userMemoryNote.count({ where: { userId } }),
    ]);

  const defaultProvider = userSettings?.defaultProvider || 'openai';
  const defaultModel = userSettings?.defaultModel || 'gpt-3.5-turbo';
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

  const totalDocs = docs.length;
  let readyDocs = 0;
  let pendingDocs = 0;
  let failedDocs = 0;
  let needsReindexDocs = 0;

  for (const doc of docs) {
    const status = doc.status || 'ready';
    if (status === 'ready') {
      readyDocs++;
      if (computeNeedsReindex(doc, embedCtx.provider)) {
        needsReindexDocs++;
      }
    } else if (status === 'pending') {
      pendingDocs++;
    } else if (status === 'failed') {
      failedDocs++;
    }
  }

  const activeProvider = overrides?.provider || defaultProvider;
  const activeModel = overrides?.model || defaultModel;

  return {
    activeProvider,
    activeModel,
    modelSupportsVision: modelSupportsVision(activeModel),
    modelSupportsWebSearch: activeProvider === 'gemini',
    webSearchEnabled: Boolean(overrides?.webSearchEnabled),
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
    maxTokens: userSettings?.maxTokens || 2000,
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
