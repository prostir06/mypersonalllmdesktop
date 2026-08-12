/** Custom protocol: mypersonalllm://chat/<conversationId> */
export const DEEP_LINK_PROTOCOL = 'mypersonalllm';

export type ChatDeepLink = {
  type: 'chat';
  conversationId: string;
};

export type DeepLinkPayload = ChatDeepLink;

export function parseDeepLink(raw: string): DeepLinkPayload | null {
  if (!raw || typeof raw !== 'string') return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== `${DEEP_LINK_PROTOCOL}:`) return null;

  const host = url.hostname.toLowerCase();
  const pathParts = url.pathname
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);

  if (host === 'chat' || pathParts[0] === 'chat') {
    const id = host === 'chat' ? pathParts[0] : pathParts[1];
    if (id && /^\d+$/.test(id)) {
      return { type: 'chat', conversationId: id };
    }
  }

  return null;
}

export function buildChatDeepLink(conversationId: string | number): string {
  const id = String(conversationId).trim();
  if (!/^\d+$/.test(id)) {
    throw new Error('Invalid conversation id for deep link');
  }
  return `${DEEP_LINK_PROTOCOL}://chat/${id}`;
}

export function findDeepLinkArg(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith(`${DEEP_LINK_PROTOCOL}://`)) {
      return arg;
    }
  }
  return null;
}
