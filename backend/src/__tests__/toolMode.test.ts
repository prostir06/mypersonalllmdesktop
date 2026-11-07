import { readToolsOverride, resolveToolsEnabled } from '../services/chat/toolMode';

describe('resolveToolsEnabled', () => {
  it('uses the saved setting when the client does not choose', () => {
    expect(resolveToolsEnabled({
      settingsEnabled: true,
      model: 'gpt-4o',
      provider: 'openai',
    })).toBe(true);
    expect(resolveToolsEnabled({
      settingsEnabled: false,
      model: 'gpt-4o',
      provider: 'openai',
    })).toBe(false);
  });

  it('lets an explicit client choice replace the saved setting', () => {
    expect(resolveToolsEnabled({
      settingsEnabled: true,
      clientOverride: false,
      model: 'gpt-4o',
      provider: 'openai',
    })).toBe(false);
    expect(resolveToolsEnabled({
      settingsEnabled: false,
      clientOverride: true,
      model: 'gpt-4o',
      provider: 'openai',
    })).toBe(true);
  });

  it('stays off when the model cannot call tools', () => {
    expect(resolveToolsEnabled({
      settingsEnabled: true,
      clientOverride: true,
      model: 'llama2',
      provider: 'ollama',
    })).toBe(false);
  });

  it('reads the first real boolean and ignores anything else', () => {
    expect(readToolsOverride(undefined, 'yes', false, true)).toBe(false);
    expect(readToolsOverride(undefined, 1)).toBeUndefined();
  });
});
