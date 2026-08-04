/**
 * Streaming / send chat turns with AbortController and rAF token batching.
 */
import { useCallback, useRef, useState } from 'react';
import { chatAPI } from '../services/api';

function isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError')
  );
}

export function useChatStream({
  conversationId,
  onNewMessage,
  selectedModel,
  selectedProvider,
  temperature,
  selectedDocIds,
  attachedImage,
  setAttachedImage,
}) {
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const rafRef = useRef(null);
  const pendingTextRef = useRef('');

  const flushStreamText = useCallback(() => {
    rafRef.current = null;
    setStreamedText(pendingTextRef.current);
  }, []);

  const queueStreamToken = useCallback(
    (token) => {
      pendingTextRef.current += token;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flushStreamText);
      }
    },
    [flushStreamText]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (userContent, setMessages) => {
      setError(null);

      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: userContent,
          created_at: new Date().toISOString(),
        },
      ]);

      const requestOptions = {
        temperature,
        documentIds: selectedDocIds,
        ragEnabled: selectedDocIds.length > 0,
        image: attachedImage?.base64 || null,
      };

      const controller = new AbortController();
      abortRef.current = controller;
      pendingTextRef.current = '';
      setStreamedText('');
      setStreaming(true);

      let sentOk = false;
      let currentStreamText = '';

      try {
        await chatAPI.streamMessage(
          conversationId,
          userContent,
          selectedModel,
          selectedProvider,
          requestOptions,
          (token) => {
            currentStreamText += token;
            queueStreamToken(token);
          },
          (newConvId) => {
            if (!conversationId && onNewMessage) onNewMessage(newConvId);
          },
          controller.signal
        );

        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setStreamedText('');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: currentStreamText,
            created_at: new Date().toISOString(),
          },
        ]);
        if (onNewMessage) onNewMessage();
        sentOk = true;
      } catch (err) {
        if (isAbortError(err)) {
          if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          const partial = pendingTextRef.current || currentStreamText;
          if (partial) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: partial,
                created_at: new Date().toISOString(),
              },
            ]);
          }
          setStreamedText('');
          return;
        }

        try {
          const response = await chatAPI.sendMessage(
            conversationId,
            userContent,
            selectedModel,
            selectedProvider,
            requestOptions
          );
          const data = response.data;
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: data.content,
              created_at: data.timestamp,
            },
          ]);
          if (onNewMessage) onNewMessage(data.conversationId);
          sentOk = true;
        } catch (fallbackErr) {
          const msg =
            fallbackErr.response?.data?.error || fallbackErr.message;
          setError(`Не вдалося отримати відповідь від AI: ${msg}`);
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setStreamedText('');
        if (sentOk) {
          setAttachedImage((prev) => {
            if (prev?.url) URL.revokeObjectURL(prev.url);
            return null;
          });
        }
      }
    },
    [
      attachedImage,
      conversationId,
      onNewMessage,
      queueStreamToken,
      selectedDocIds,
      selectedModel,
      selectedProvider,
      setAttachedImage,
      temperature,
    ]
  );

  return {
    streaming,
    streamedText,
    error,
    setError,
    sendMessage,
    stopStreaming,
  };
}
