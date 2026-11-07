import { clampGeneration } from '../services/chat/generationOptions';

const saved = { temperature: 0.2, max_tokens: 1024 };

describe('clampGeneration', () => {
  it('uses the saved setting when the client omits the field', () => {
    expect(clampGeneration(saved, {})).toEqual({ temperature: 0.2, max_tokens: 1024 });
  });

  it('accepts an in-range client override', () => {
    expect(clampGeneration(saved, { temperature: 0, max_tokens: 2000 })).toEqual({
      temperature: 0,
      max_tokens: 2000,
    });
  });

  it('drops out-of-range and non-numeric client values', () => {
    expect(
      clampGeneration(saved, { temperature: 9, max_tokens: '4096' as unknown as number })
    ).toEqual({ temperature: 0.2, max_tokens: 1024 });
  });

  it('clamps a saved temperature of 5 down to 2', () => {
    expect(clampGeneration({ temperature: 5, max_tokens: 10 }, {})).toEqual({
      temperature: 2,
      max_tokens: 100,
    });
  });
});
