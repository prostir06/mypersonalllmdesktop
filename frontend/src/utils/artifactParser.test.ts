import { describe, expect, it } from 'vitest';
import { parseArtifacts } from './artifactParser';

describe('artifactParser', () => {
  it('detects full HTML document as an HTML artifact with heading title', () => {
    const markdown = `
Ось інтерактивний документ:
\`\`\`html
<!DOCTYPE html>
<html>
<body>
  <h1>Hello</h1>
</body>
</html>
\`\`\`
Сподіваюся, вам сподобається!
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      id: 'artifact-1',
      type: 'html',
      language: 'html',
      title: 'Hello',
    });
    expect(artifacts[0].content).toContain('<!DOCTYPE html>');
    expect(artifacts[0].content).toContain('<h1>Hello</h1>');
  });

  it('detects HTML snippet with HTML elements as an HTML artifact with fallback title', () => {
    const markdown = `
\`\`\`html
<div class="card">
  <p>Hello world</p>
</div>
\`\`\`
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      id: 'artifact-1',
      type: 'html',
      language: 'html',
      title: 'Інтерактивний HTML',
    });
    expect(artifacts[0].content).toBe('<div class="card">\n  <p>Hello world</p>\n</div>');
  });

  it('detects xml block containing svg as an SVG artifact', () => {
    const markdown = `
\`\`\`xml
<svg viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="blue" />
</svg>
\`\`\`
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      id: 'artifact-1',
      type: 'svg',
      language: 'svg',
      title: 'Векторне зображення SVG',
    });
    expect(artifacts[0].content).toContain('<circle cx="50" cy="50" r="40"');
  });

  it('detects svg block as an SVG artifact with title from svg title tag', () => {
    const markdown = `
\`\`\`svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <title>Діаграма мережі</title>
  <rect width="100" height="100" fill="green" />
</svg>
\`\`\`
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      id: 'artifact-1',
      type: 'svg',
      language: 'svg',
      title: 'Діаграма мережі',
    });
  });

  it('ignores plain code blocks such as javascript, python, and non-svg xml', () => {
    const markdown = `
\`\`\`javascript
console.log('Hello, world!');
\`\`\`

\`\`\`python
def foo():
    return 42
\`\`\`

\`\`\`xml
<config>
  <setting name="debug" value="true" />
</config>
\`\`\`

\`\`\`json
{ "status": "ok" }
\`\`\`
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toEqual([]);
  });

  it('extracts title from comment with title prefix inside code block', () => {
    const markdown = `
\`\`\`html
<!-- title: Картка профілю -->
<div class="profile-card">
  <span>Іван Франко</span>
</div>
\`\`\`
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].title).toBe('Картка профілю');
  });

  it('extracts title from leading comment without title prefix', () => {
    const markdown = `
\`\`\`html
<!-- Картка профілю -->
<div class="profile-card">
  <span>Іван Франко</span>
</div>
\`\`\`
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].title).toBe('Картка профілю');
  });

  it('extracts title from comment immediately preceding code block in markdown', () => {
    const markdown = `
<!-- title: Зовнішній заголовок -->
\`\`\`html
<div class="box">
  <p>Вміст</p>
</div>
\`\`\`
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].title).toBe('Зовнішній заголовок');
  });

  it('extracts title from html title tag when present', () => {
    const markdown = `
\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <title>Калькулятор податків</title>
</head>
<body>
  <div>Калькулятор</div>
</body>
</html>
\`\`\`
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].title).toBe('Калькулятор податків');
  });

  it('extracts title from first heading tag (h1-h6) when present', () => {
    const markdown = `
\`\`\`html
<section>
  <h2>Статистика продажів</h2>
  <canvas id="chart"></canvas>
</section>
\`\`\`
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].title).toBe('Статистика продажів');
  });

  it('handles multiple artifacts in a single message with sequential ids', () => {
    const markdown = `
Ось віджет форми:
\`\`\`html
<!-- title: Форма реєстрації -->
<form>
  <button type="submit">Надіслати</button>
</form>
\`\`\`

І графічна іконка:
\`\`\`svg
<svg viewBox="0 0 50 50">
  <title>Іконка успіху</title>
  <circle cx="25" cy="25" r="20" fill="green" />
</svg>
\`\`\`
`;

    const artifacts = parseArtifacts(markdown);
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).toMatchObject({
      id: 'artifact-1',
      type: 'html',
      title: 'Форма реєстрації',
    });
    expect(artifacts[1]).toMatchObject({
      id: 'artifact-2',
      type: 'svg',
      title: 'Іконка успіху',
    });
  });

  it('ignores empty, whitespace-only, or invalid code blocks safely without throwing', () => {
    expect(parseArtifacts('')).toEqual([]);
    expect(parseArtifacts(null as unknown as string)).toEqual([]);
    expect(parseArtifacts(undefined as unknown as string)).toEqual([]);
    expect(parseArtifacts(123 as unknown as string)).toEqual([]);

    const emptyBlocks = `
\`\`\`html
\`\`\`

\`\`\`html
   
\`\`\`

\`\`\`svg
\`\`\`

\`\`\`html
Це просто текст без жодних HTML тегів.
\`\`\`
`;

    expect(parseArtifacts(emptyBlocks)).toEqual([]);
  });

  it('detects unclosed trailing HTML code block cut off at EOF by token limit', () => {
    const truncatedMarkdown = `
Ось код опитування:
\`\`\`html
<!DOCTYPE html>
<html lang="uk">
<head>
  <title>Опитування з валідацією</title>
</head>
<body>
  <div class="form-container">
    <h1>Опитування</h1>
    <!-- Поле 5: Коментар (Необов'язкове, Текст)`;

    const artifacts = parseArtifacts(truncatedMarkdown);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      id: 'artifact-1',
      type: 'html',
      language: 'html',
      title: 'Опитування з валідацією',
    });
    expect(artifacts[0].content).toContain('<h1>Опитування</h1>');
  });

  it('detects unclosed trailing SVG code block cut off at EOF', () => {
    const truncatedSvg = `
\`\`\`svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="purple" />`;

    const artifacts = parseArtifacts(truncatedSvg);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      id: 'artifact-1',
      type: 'svg',
      language: 'svg',
      title: 'Векторне зображення SVG',
    });
  });
});
