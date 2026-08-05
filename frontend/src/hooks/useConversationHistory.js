/**
 * Load conversation history; abort in-flight fetch when conversationId changes.
 */
import { useEffect, useState } from 'react';
import { chatAPI } from '../services/api';
import { isAbortError } from '../services/sseParse';

export function useConversationHistory(conversationId, setError) {
  const [messages, setMessages] = useState([]);
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
        const history = response.data.messages || response.data || [];
        setMessages(history);
      } catch (err) {
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
