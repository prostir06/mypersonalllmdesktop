import type { Components } from 'react-markdown';

type ElectronBridge = { openExternal?: (url: string) => Promise<void> };

function isHttp(href: string): boolean {
  try {
    const protocol = new URL(href, 'https://placeholder.local').protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export const markdownComponents: Components = {
  a: ({ href, children }) => {
    if (!href || !isHttp(href)) return <span>{children}</span>;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          const bridge = (window as unknown as { electron?: ElectronBridge }).electron;
          if (bridge?.openExternal) {
            event.preventDefault();
            void bridge.openExternal(href);
          }
        }}
      >
        {children}
      </a>
    );
  },
};
