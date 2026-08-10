/**
 * Renderer typings for the Electron preload bridge.
 */
export type ElectronBridge = {
  getBackendUrl: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
};

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}

export {};
