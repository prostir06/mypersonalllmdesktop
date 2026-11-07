import { Prisma } from '../generated/prisma/client';

/**
 * Build a parameterized FTS query matching idx_messages_content_search
 * (gin(to_tsvector('simple', content))).
 */
export function buildMessageFtsQuery(
  userId: number,
  query: string,
  conversationId: number | null
): Prisma.Sql {
  const q = query.trim();
  if (conversationId == null) {
    return Prisma.sql`
      SELECT m.id, m.role, m.content, m.created_at,
             c.id AS conversation_id, c.title AS conversation_title
      FROM messages m
      INNER JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ${userId}
        AND to_tsvector('simple', m.content) @@ plainto_tsquery('simple', ${q})
      ORDER BY m.created_at DESC
      LIMIT 50
    `;
  }

  return Prisma.sql`
    SELECT m.id, m.role, m.content, m.created_at,
           c.id AS conversation_id, c.title AS conversation_title
    FROM messages m
    INNER JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ${userId}
      AND m.conversation_id = ${conversationId}
      AND to_tsvector('simple', m.content) @@ plainto_tsquery('simple', ${q})
    ORDER BY m.created_at DESC
    LIMIT 50
  `;
}
