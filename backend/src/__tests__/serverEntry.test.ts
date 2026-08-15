describe('server entry', () => {
  it('exports an express app with handle', () => {
    // Will fail until server.ts exists and package/dev paths resolve
    const app = require('../server');
    expect(typeof app).toBe('function');
    expect(typeof app.handle).toBe('function');
  });
});
