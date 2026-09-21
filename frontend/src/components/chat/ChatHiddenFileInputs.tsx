import React, { type ChangeEvent, type RefObject } from 'react';

type Props = {
  chatFileInputRef: RefObject<HTMLInputElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  onFileAttach: (e: ChangeEvent<HTMLInputElement>) => void;
  onImageAttach: (e: ChangeEvent<HTMLInputElement>) => void;
};

export default function ChatHiddenFileInputs({
  chatFileInputRef,
  imageInputRef,
  onFileAttach,
  onImageAttach,
}: Props) {
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
