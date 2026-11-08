import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processChatImage } from './imageCompressor';

describe('imageCompressor', () => {
  const originalImage = global.Image;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-image');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    global.Image = originalImage;
  });

  it('reads small GIF file directly as data URL', async () => {
    const file = new File(['test gif content'], 'test.gif', {
      type: 'image/gif',
    });

    const result = await processChatImage(file);
    expect(result.url).toBe('blob:test-image');
    expect(result.base64).toMatch(/^data:image\/gif;base64,/);
  });

  it('reads small JPEG file when Image/canvas are mock-supported', async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 800;
      height = 600;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 10);
      }
    }
    global.Image = MockImage as unknown as typeof Image;

    const file = new File(['test jpeg'], 'test.jpg', {
      type: 'image/jpeg',
    });

    const result = await processChatImage(file);
    expect(result.url).toBe('blob:test-image');
    expect(typeof result.base64).toBe('string');
  });

  it('scales down oversized images and draws to canvas', async () => {
    class MockLargeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 4000;
      height = 3000;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 10);
      }
    }
    global.Image = MockLargeImage as unknown as typeof Image;

    const mockContext = {
      drawImage: vi.fn(),
    };
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockContext),
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,mockResized'),
    };
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas as unknown as HTMLCanvasElement;
      }
      return document.createElement(tagName);
    });

    const file = new File(['large jpeg content'], 'large.jpg', {
      type: 'image/jpeg',
    });

    const result = await processChatImage(file);
    expect(result.url).toBe('blob:test-image');
    expect(result.base64).toBe('data:image/jpeg;base64,mockResized');
    expect(mockCanvas.width).toBe(1920);
    expect(mockCanvas.height).toBe(1440);
    expect(mockContext.drawImage).toHaveBeenCalled();
  });
});
