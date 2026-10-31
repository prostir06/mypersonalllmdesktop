import { sanitizeDocumentIds } from '../chat/ownership';
import type { ChatMessage, ChatOptions } from '../chat/types';
import {
  buildUserSystemSnapshot,
  evaluateSystemAdvisories,
  type SnapshotOverrides,
} from './advisor';
import { buildIntrospectedKnowledgeCatalog } from './introspector';
import {
  formatTier1Passport,
  formatTier2Cards,
  matchRelevantKnowledgeCards,
} from './matcher';
import type { SystemKnowledgeResponse } from './types';

export * from './types';
export * from './liveMetadata';
export * from './registry';
export * from './introspector';
export * from './advisor';
export * from './matcher';

/**
 * Returns full system self-knowledge response for a user, including
 * catalog cards with versionHash, snapshot, and active advisories.
 */
export async function getSystemKnowledgeForUser(
  userId: number,
  overrides?: SnapshotOverrides
): Promise<SystemKnowledgeResponse> {
  const { cards, versionHash } = buildIntrospectedKnowledgeCatalog();
  const snapshot = await buildUserSystemSnapshot(userId, overrides);
  const advisories = evaluateSystemAdvisories(snapshot);
  return {
    versionHash,
    generatedAt: new Date().toISOString(),
    snapshot,
    advisories,
    cards,
  };
}

/**
 * Builds system prompt messages containing Tier 1 passport and Tier 2 matched knowledge cards.
 */
export async function buildSystemKnowledgeMessages(
  userId: number,
  userMessage = '',
  options?: ChatOptions
): Promise<ChatMessage[]> {
  const { cards, versionHash } = buildIntrospectedKnowledgeCatalog();
  const selectedDocs = sanitizeDocumentIds(options?.documentIds);
  const ragEnabled = Boolean(options?.ragEnabled || selectedDocs.length > 0);

  const overrides: SnapshotOverrides = {
    provider: options?.activeProvider,
    model: options?.activeModel,
    selectedDocCount: selectedDocs.length,
    webSearchEnabled: Boolean(options?.enableWebSearch),
  };

  const snapshot = await buildUserSystemSnapshot(userId, overrides);
  const advisories = evaluateSystemAdvisories(snapshot);

  const tier1Text = formatTier1Passport(snapshot, advisories, versionHash);
  const messages: ChatMessage[] = [{ role: 'system', content: tier1Text }];

  const matchedCards = matchRelevantKnowledgeCards(
    userMessage,
    snapshot,
    advisories,
    cards,
    { ragEnabled }
  );

  const tier2Text = formatTier2Cards(matchedCards);
  if (tier2Text) {
    messages.push({ role: 'system', content: tier2Text });
  }

  return messages;
}
