import type { Artifact } from '../types/api';

export type { Artifact };

const CODE_BLOCK_REGEX = /```(?:([a-zA-Z0-9_-]+))?[^\r\n]*\r?\n([\s\S]*?)```/g;

const HTML_MARKUP_REGEX =
  /<(?:!doctype|html|head|body|div|span|p|a|button|canvas|svg|style|script|table|form|input|section|main|article|header|footer|nav|h[1-6]|ul|ol|li|iframe|img)\b/i;

const GENERAL_HTML_TAG_REGEX = /<[a-z!][\w-]*(\s+[^>]*)?>/i;

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, '')).trim();
}

function extractTitle(
  content: string,
  beforeBlock: string,
  type: 'html' | 'svg'
): string {
  // 1. Explicit title comment inside the code block: <!-- title: ... -->
  const insideTitleComment = content.match(/<!--\s*title:\s*([^\r\n-]+?)\s*-->/i);
  if (insideTitleComment && insideTitleComment[1]?.trim()) {
    return insideTitleComment[1].trim();
  }

  // 2. Explicit title comment immediately preceding code block in markdown
  const precedingTitleComment = beforeBlock.match(/<!--\s*(?:title:\s*)?([^\r\n-]+?)\s*-->\s*$/i);
  if (precedingTitleComment && precedingTitleComment[1]?.trim()) {
    return precedingTitleComment[1].trim();
  }

  // 3. Leading HTML comment inside the code block: <!-- My Title -->
  const leadingComment = content.trimStart().match(/^<!--\s*([^\r\n-]+?)\s*-->/);
  if (leadingComment && leadingComment[1]?.trim()) {
    const raw = leadingComment[1].trim();
    if (!/^<!/i.test(raw) && raw.length > 0) {
      return raw.replace(/^title:\s*/i, '').trim();
    }
  }

  // 4. <title> tag inside content (common in full HTML and SVG)
  const titleTagMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTagMatch && titleTagMatch[1]?.trim()) {
    const cleanTitle = stripTags(titleTagMatch[1]);
    if (cleanTitle) {
      return cleanTitle;
    }
  }

  // 5. First heading tag (h1-h6) inside content
  const headingMatch = content.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (headingMatch && headingMatch[1]?.trim()) {
    const cleanHeading = stripTags(headingMatch[1]);
    if (cleanHeading) {
      return cleanHeading;
    }
  }

  // 6. Preceding markdown heading: e.g. ### Title right before the code block
  const precedingHeadingMatch = beforeBlock.match(/(?:^|\n)#{1,6}\s+([^\r\n]+)\s*$/);
  if (precedingHeadingMatch && precedingHeadingMatch[1]?.trim()) {
    const cleanHeading = precedingHeadingMatch[1].trim();
    if (cleanHeading) {
      return cleanHeading;
    }
  }

  // 7. Sensible defaults
  return type === 'svg' ? 'Векторне зображення SVG' : 'Інтерактивний HTML';
}

/**
 * Parses markdown text to detect HTML and SVG code blocks that qualify as interactive artifacts.
 */
export function parseArtifacts(markdown: string): Artifact[] {
  if (!markdown || typeof markdown !== 'string') {
    return [];
  }

  const artifacts: Artifact[] = [];
  const regex = new RegExp(CODE_BLOCK_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    const rawLang = (match[1] || '').trim().toLowerCase();
    const blockContent = match[2] || '';
    const trimmedContent = blockContent.trim();

    if (!trimmedContent) {
      continue;
    }

    const isHtmlLang = rawLang === 'html' || rawLang === 'htm' || rawLang === 'xhtml';
    const isSvgLang = rawLang === 'svg';
    const isXmlLang = rawLang === 'xml';

    if (!isHtmlLang && !isSvgLang && !isXmlLang) {
      continue;
    }

    const hasSvgTag = /<svg\b/i.test(trimmedContent);
    const hasHtmlMarkup =
      HTML_MARKUP_REGEX.test(trimmedContent) || GENERAL_HTML_TAG_REGEX.test(trimmedContent);

    let type: 'html' | 'svg';
    let language: string;

    if (isXmlLang) {
      if (!hasSvgTag) {
        continue;
      }
      type = 'svg';
      language = 'svg';
    } else if (isSvgLang) {
      if (!hasSvgTag) {
        continue;
      }
      type = 'svg';
      language = 'svg';
    } else if (isHtmlLang) {
      if (!hasHtmlMarkup) {
        continue;
      }
      // If code block is purely an SVG element inside an html tag, treat as svg
      if (hasSvgTag && !/<(?:!doctype|html|body|div|button|canvas|form|section|main|h[1-6])\b/i.test(trimmedContent)) {
        type = 'svg';
        language = 'svg';
      } else {
        type = 'html';
        language = 'html';
      }
    } else {
      continue;
    }

    const beforeBlock = markdown.slice(0, match.index);
    const title = extractTitle(trimmedContent, beforeBlock, type);
    const id = `artifact-${artifacts.length + 1}`;

    artifacts.push({
      id,
      type,
      title,
      language,
      content: trimmedContent,
    });
  }

  return artifacts;
}
