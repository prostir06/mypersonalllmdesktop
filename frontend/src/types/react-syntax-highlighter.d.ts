declare module 'react-syntax-highlighter' {
  import type { ComponentType } from 'react';

  export const PrismLight: ComponentType<{
    style?: Record<string, unknown>;
    language?: string;
    PreTag?: string;
    children?: string;
    [key: string]: unknown;
  }> & {
    registerLanguage: (name: string, lang: unknown) => void;
  };
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/one-dark' {
  const style: Record<string, unknown>;
  export default style;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/*' {
  const lang: unknown;
  export default lang;
}
