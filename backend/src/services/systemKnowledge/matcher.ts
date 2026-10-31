import type {
  AdvisoryTip,
  KnowledgeCard,
  UserSystemSnapshot,
} from './types';

/**
 * Matches up to 4 relevant knowledge cards based on user query keywords,
 * active advisory warnings, and active turn flags (e.g. RAG enabled).
 */
export function matchRelevantKnowledgeCards(
  userMessage: string,
  _snapshot: UserSystemSnapshot,
  advisories: AdvisoryTip[],
  cards: KnowledgeCard[],
  options?: { ragEnabled?: boolean }
): KnowledgeCard[] {
  const normalized = (userMessage || '').toLowerCase();
  const cleanText = normalized.replace(/[’ʼ`']/g, "'").trim();

  const scoredCards: Array<{ card: KnowledgeCard; score: number }> = [];

  for (const card of cards) {
    let score = 0;
    let queryMatch = false;

    if (cleanText) {
      // 1. Check card keywords
      for (const kw of card.keywords) {
        const normalizedKw = kw.toLowerCase().replace(/[’ʼ`']/g, "'");
        if (normalizedKw && cleanText.includes(normalizedKw)) {
          score += 3;
          queryMatch = true;
        }
      }

      // 2. Check related settings
      for (const s of card.relatedSettings || []) {
        const normS = s.toLowerCase();
        if (normS && cleanText.includes(normS)) {
          score += 2;
          queryMatch = true;
        }
      }

      // 3. Check related routes
      for (const r of card.relatedRoutes || []) {
        const normR = r.toLowerCase();
        if (normR && cleanText.includes(normR)) {
          score += 1;
          queryMatch = true;
        }
      }

      // 4. Check card title
      const titleLower = card.title.toLowerCase().replace(/[’ʼ`']/g, "'");
      if (cleanText.includes(titleLower)) {
        score += 4;
        queryMatch = true;
      }

      // 5. Common Ukrainian stem / platform concept mapping
      if (
        card.category === 'memory' &&
        (cleanText.includes("пам'ят") || cleanText.includes('нотатк'))
      ) {
        score += 3;
        queryMatch = true;
      }

      if (
        card.category === 'rag' &&
        (cleanText.includes('документ') ||
          cleanText.includes('ембед') ||
          cleanText.includes('векторн') ||
          cleanText.includes('індексац'))
      ) {
        score += 3;
        queryMatch = true;
      }

      if (
        (card.category === 'settings' || card.uiPath === '/settings') &&
        cleanText.includes('налаштуван')
      ) {
        score += 2;
        queryMatch = true;
      }

      if (
        card.id === 'setting-temperature-tokens' &&
        (cleanText.includes('температур') || cleanText.includes('токен'))
      ) {
        score += 3;
        queryMatch = true;
      }

      if (
        card.category === 'providers' &&
        (cleanText.includes('провайдер') ||
          cleanText.includes('модел') ||
          cleanText.includes('хост'))
      ) {
        score += 2;
        queryMatch = true;
      }

      if (
        card.category === 'artifacts' &&
        (cleanText.includes('артефакт') ||
          cleanText.includes('mermaid') ||
          cleanText.includes('svg') ||
          cleanText.includes('html'))
      ) {
        score += 4;
        queryMatch = true;
      }

      if (
        (card.id === 'prompt-library' || card.id === 'setting-system-prompt') &&
        (cleanText.includes('промпт') || cleanText.includes('шаблон'))
      ) {
        score += 3;
        queryMatch = true;
      }

      if (
        card.category === 'desktop' &&
        (cleanText.includes('десктоп') || cleanText.includes('desktop'))
      ) {
        score += 3;
        queryMatch = true;
      }
    }

    // 6. Active category warning check
    const hasCategoryWarning = advisories.some(
      (a) => a.severity === 'warning' && a.category === card.category
    );

    const isRagTurn = card.category === 'rag' && Boolean(options?.ragEnabled);

    if (hasCategoryWarning && (queryMatch || isRagTurn)) {
      score += 10;
    }

    if (score > 0) {
      scoredCards.push({ card, score });
    }
  }

  return scoredCards
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((sc) => sc.card);
}

/**
 * Formats a compact Tier 1 passport string (~150-180 tokens) with system identity,
 * capabilities, interactive artifacts instruction, and live platform status.
 */
export function formatTier1Passport(
  snapshot: UserSystemSnapshot,
  advisories: AdvisoryTip[],
  versionHash: string
): string {
  const warnings = advisories
    .filter((a) => a.severity === 'warning')
    .map((a) => a.id)
    .join(', ');
  const warningsText = warnings || 'немає';

  const visionText = snapshot.modelSupportsVision ? 'так' : 'ні';
  const webSearchState = snapshot.webSearchEnabled ? 'увімкнено' : 'вимкнено';
  const webSearchSupport = snapshot.modelSupportsWebSearch
    ? 'підтримується'
    : 'не підтримується';

  return [
    'Ви працюєте всередині персонального асистента "LLM Personal Assistant Control Panel".',
    'Можливості платформи: мультипровайдерний чат (OpenAI, Gemini, Claude, Ollama), Hybrid RAG (семантичний та повнотекстовий пошук за документами) проти одноразових вкладень 📎, дворівнева пам\'ять (нотатки діалогу та користувача), бібліотека промптів, експорт історій.',
    'Для інтерактивних візуалізацій повертайте окремі блоки коду ```html або ```svg із коментарем <!-- title: Назва --> на першому рядку для відображення в ArtifactPanel.',
    `Поточний стан системи [v:${versionHash}]: Провайдер=${snapshot.activeProvider}, Модель=${snapshot.activeModel}, Vision=${visionText}, Веб-пошук=${webSearchSupport} (${webSearchState}), RAG-режим=${snapshot.ragEmbeddingMode} (готових документів: ${snapshot.documents.ready}), Нотаток пам'яті=${snapshot.userMemoryNotesCount}, Активні попередження=${warningsText}.`,
    'Якщо користувач запитує про налаштування платформи, ліміти чи вирішення проблем — відповідайте влучно, корисно та спираючись на актуальний стан системи.',
  ].join('\n\n');
}

/**
 * Formats matched Tier 2 reference cards into an informative prompt section.
 * Returns empty string if no cards provided.
 */
export function formatTier2Cards(cards: KnowledgeCard[]): string {
  if (!cards || cards.length === 0) {
    return '';
  }

  const blocks = cards.map((card) => {
    return [
      `📌 ${card.title} (${card.uiPath})`,
      `Призначення: ${card.summary}`,
      `Для чого: ${card.whyUse}`,
      `Як використовувати: ${card.howToUse}`,
      `Поточні параметри: ${JSON.stringify(card.liveFacts)}`,
    ].join('\n');
  });

  return [
    'ℹ️ ДЕТАЛЬНА ДОВІДКА ПО ФУНКЦІЯХ ПЛАТФОРМИ (актуальні правила та ліміти):',
    ...blocks,
  ].join('\n\n');
}
