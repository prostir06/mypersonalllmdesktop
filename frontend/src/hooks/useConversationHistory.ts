/**
 * Load conversation history; abort in-flight fetch when conversationId changes.
 */
import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { chatAPI } from '../services/api';
import { isAbortError } from '../services/sseParse';
import type { Message } from '../types/api';

export function useConversationHistory(
  conversationId: string | number | null | undefined,
  setError?: Dispatch<SetStateAction<string | null>>
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        if (setError) setError(null);
        const response = await chatAPI.getHistory(conversationId, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const history = response.data.messages || [];
        setMessages(Array.isArray(history) ? history : []);
      } catch (err: unknown) {
        if (isAbortError(err) || controller.signal.aborted) return;
        if (setError) {
          setError('Не вдалося завантажити історію повідомлень');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [conversationId, setError]);

  return { messages, setMessages, loading };
}
