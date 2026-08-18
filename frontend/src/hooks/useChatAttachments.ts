import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { chatAPI } from '../services/api';
import type { ChatAttachmentPayload } from '../types/api';
import type { AttachedImage } from './useChatStream';

type UseChatAttachmentsResult = {
  attachedImage: AttachedImage;
  setAttachedImage: Dispatch<SetStateAction<AttachedImage>>;
  chatAttachments: ChatAttachmentPayload[];
  setChatAttachments: Dispatch<SetStateAction<ChatAttachmentPayload[]>>;
  handleImageAttach: (e: ChangeEvent<HTMLInputElement>) => void;
  handleFileAttach: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  clearAttachedImage: () => void;
  removeAttachment: (index: number) => void;
  imageInputRef: RefObject<HTMLInputElement | null>;
  chatFileInputRef: RefObject<HTMLInputElement | null>;
};

export function useChatAttachments(): UseChatAttachmentsResult {
  const [attachedImage, setAttachedImage] = useState<AttachedImage>(null);
  const [chatAttachments, setChatAttachments] = useState<
    ChatAttachmentPayload[]
  >([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImageAttach = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Будь ласка, оберіть зображення (JPG, PNG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachedImage({
        url: URL.createObjectURL(file),
        base64: String(ev.target?.result || ''),
      });
      toast.info('🖼️ Зображення додано до повідомлення!');
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  const clearAttachedImage = useCallback(() => {
    if (attachedImage?.url) URL.revokeObjectURL(attachedImage.url);
    setAttachedImage(null);
  }, [attachedImage]);

  const handleFileAttach = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const allowed =
        /\.(pdf|xlsx|txt|md)$/i.test(file.name) ||
        [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain',
          'text/markdown',
        ].includes(file.type);
      if (!allowed) {
        toast.error('Дозволено лише PDF, XLSX, TXT, MD');
        return;
      }
      if (chatAttachments.length >= 5) {
        toast.warn('Максимум 5 вкладень на повідомлення');
        return;
      }
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await chatAPI.uploadAttachment(formData);
        setChatAttachments((prev) => [
          ...prev,
          { filename: res.data.filename, content: res.data.content },
        ]);
        toast.success(
          res.data.truncated
            ? `Файл додано (обрізано до ${res.data.chars} символів)`
            : 'Файл додано до повідомлення'
        );
      } catch (err: unknown) {
        const ax = err as AxiosError<{ error?: string }>;
        console.warn('Chat attachment upload failed:', err);
        toast.error(ax.response?.data?.error || 'Помилка обробки файлу');
      }
      if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    },
    [chatAttachments.length]
  );

  const removeAttachment = useCallback((index: number) => {
    setChatAttachments((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  return {
    attachedImage,
    setAttachedImage,
    chatAttachments,
    setChatAttachments,
    handleImageAttach,
    handleFileAttach,
    clearAttachedImage,
    removeAttachment,
    imageInputRef,
    chatFileInputRef,
  };
}
