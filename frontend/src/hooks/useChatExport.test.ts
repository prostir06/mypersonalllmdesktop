import { describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from './useChatExport';

describe('downloadTextFile', () => {
  it('creates blob link and revokes object URL', () => {
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createObjectURL = vi.fn().mockReturnValue('blob:chat-export');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          element.click = click;
        }
        return element;
      });

    downloadTextFile('hello', 'chat.md', 'text/markdown;charset=utf-8');

    expect(createElement).toHaveBeenCalledWith('a');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:chat-export');
  });
});
