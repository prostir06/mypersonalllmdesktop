import React, { type ChangeEvent, type RefObject } from 'react';
import { useChatSession } from '../../context/ChatSessionContext';

type Props = {
  chatFileInputRef?: RefObject<HTMLInputElement>;
  imageInputRef?: RefObject<HTMLInputElement>;
  onFileAttach?: (e: ChangeEvent<HTMLInputElement>) => void;
  onImageAttach?: (e: ChangeEvent<HTMLInputElement>) => void;
};

export default function ChatHiddenFileInputs(props: Props) {
  const session = useChatSession();
  const chatFileInputRef = session?.attachments.chatFileInputRef ?? props.chatFileInputRef;
  const imageInputRef = session?.attachments.imageInputRef ?? props.imageInputRef;
  const onFileAttach = session?.attachments.handleFileAttach ?? props.onFileAttach;
  const onImageAttach = session?.attachments.handleImageAttach ?? props.onImageAttach;
  if (!chatFileInputRef || !imageInputRef || !onFileAttach || !onImageAttach) return null;
  return (
    <>
      <input
        type="file"
        ref={chatFileInputRef}
        accept=".pdf,.xlsx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/markdown"
        style={{ display: 'none' }}
        onChange={onFileAttach}
      />
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onImageAttach}
      />
    </>
  );
}
