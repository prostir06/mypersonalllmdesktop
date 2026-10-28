import { modelSupportsVision } from '../utils/modelCapabilities';

describe('modelSupportsVision', () => {
  it('returns true for explicit vision catalog ids', () => {
    expect(modelSupportsVision('gpt-4o')).toBe(true);
    expect(modelSupportsVision('GPT-4O-MINI')).toBe(true);
    expect(modelSupportsVision('gpt-4-turbo')).toBe(true);
  });

  it('returns false for non-vision and substring lookalikes', () => {
    expect(modelSupportsVision('gpt-4')).toBe(false);
    expect(modelSupportsVision('gpt-3.5-turbo')).toBe(false);
    expect(modelSupportsVision('llama3')).toBe(false);
    expect(modelSupportsVision('')).toBe(false);
    expect(modelSupportsVision(null)).toBe(false);
  });

  it('recognizes gemini models as supporting vision', () => {
    expect(modelSupportsVision('gemini-2.0-flash')).toBe(true);
    expect(modelSupportsVision('gemini-1.5-flash')).toBe(true);
    expect(modelSupportsVision('gemini-1.5-pro')).toBe(true);
  });
});
