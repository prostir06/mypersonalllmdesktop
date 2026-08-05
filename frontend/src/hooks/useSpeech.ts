/**
 * Speech-to-text / text-to-speech helpers for chat.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { toast } from 'react-toastify';

export function useSpeech(
  setInputMessage: Dispatch<SetStateAction<string>>
) {
  const [isListening, setIsListening] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return undefined;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'uk-UA';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setIsListening(false);
      toast.info(`🎤 Голос розпізнано: "${transcript}"`);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    return undefined;
  }, [setInputMessage]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) {
      toast.warn('Ваш браузер не підтримує Web Speech API голосового вводу');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        toast.info('🎤 Говоріть зараз...');
      } catch {
        setIsListening(false);
      }
    }
  }, [isListening]);

  const speakText = useCallback(
    (text: string, idx: number) => {
      if (!('speechSynthesis' in window)) {
        toast.warn('Синтез мовлення не підтримується');
        return;
      }
      if (speakingIdx === idx) {
        window.speechSynthesis.cancel();
        setSpeakingIdx(null);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        text.replace(/[#*`_~]/g, '')
      );
      utterance.lang = 'uk-UA';
      utterance.onend = () => setSpeakingIdx(null);
      utterance.onerror = () => setSpeakingIdx(null);
      setSpeakingIdx(idx);
      window.speechSynthesis.speak(utterance);
    },
    [speakingIdx]
  );

  return { isListening, speakingIdx, toggleListening, speakText };
}
