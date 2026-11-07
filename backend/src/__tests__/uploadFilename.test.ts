import { storedFilename } from '../middleware/upload';

it('uses a uuid and a whitelisted extension', () => {
  const name = storedFilename('../../etc/passwd.pdf');
  expect(name).toMatch(/^[0-9a-f-]{36}\.pdf$/i);
  expect(name).not.toContain('passwd');
  expect(name).not.toContain('..');
});

it('falls back to .bin for other extensions', () => {
  expect(storedFilename('shell.exe')).toMatch(/^[0-9a-f-]{36}\.bin$/i);
});
