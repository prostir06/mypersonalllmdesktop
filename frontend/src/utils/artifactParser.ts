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
  type: 'html' | 'svg' | 'docx'
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

  // Markdown heading inside DOCX document
  if (type === 'docx') {
    const mdHeadingInDoc = content.match(/^\s*#{1,3}\s+([^\r\n]+)/m);
    if (mdHeadingInDoc) {
      return mdHeadingInDoc[1].trim().slice(0, 60);
    }
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
  if (type === 'docx') {
    return 'Документ Word (DOCX)';
  }
  return type === 'svg' ? 'Векторне зображення SVG' : 'Інтерактивний HTML';
}

/**
 * Parses markdown text to detect HTML, SVG, and DOCX code blocks that qualify as interactive artifacts.
 */
export function parseArtifacts(markdown: string, scope?: string): Artifact[] {
  if (!markdown || typeof markdown !== 'string') {
    return [];
  }

  const artifacts: Artifact[] = [];
  const regex = new RegExp(CODE_BLOCK_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  const processBlock = (
    rawLang: string,
    blockContent: string,
    beforeBlock: string
  ) => {
    const trimmedContent = blockContent.trim();

    if (!trimmedContent) {
      return;
    }

    const isHtmlLang = rawLang === 'html' || rawLang === 'htm' || rawLang === 'xhtml';
    const isSvgLang = rawLang === 'svg';
    const isXmlLang = rawLang === 'xml';
    const isDocxLang = rawLang === 'docx' || rawLang === 'document' || rawLang === 'doc';

    if (!isHtmlLang && !isSvgLang && !isXmlLang && !isDocxLang) {
      return;
    }

    let type: 'html' | 'svg' | 'docx';
    let language: string;

    if (isDocxLang) {
      type = 'docx';
      language = 'markdown';
    } else if (isXmlLang) {
      const hasSvgTag = /<svg\b/i.test(trimmedContent);
      if (!hasSvgTag) {
        return;
      }
      type = 'svg';
      language = 'svg';
    } else if (isSvgLang) {
      const hasSvgTag = /<svg\b/i.test(trimmedContent);
      if (!hasSvgTag) {
        return;
      }
      type = 'svg';
      language = 'svg';
    } else if (isHtmlLang) {
      const hasSvgTag = /<svg\b/i.test(trimmedContent);
      const hasHtmlMarkup =
        HTML_MARKUP_REGEX.test(trimmedContent) || GENERAL_HTML_TAG_REGEX.test(trimmedContent);
      if (!hasHtmlMarkup) {
        return;
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
      return;
    }

    const title = extractTitle(trimmedContent, beforeBlock, type);
    const ordinal = artifacts.length + 1;
    const safeScope = scope?.replace(/[^\w-]/g, '');
    const id = safeScope ? `artifact-${safeScope}-${ordinal}` : `artifact-${ordinal}`;

    artifacts.push({
      id,
      type,
      title,
      language,
      content: trimmedContent,
    });
  };

  while ((match = regex.exec(markdown)) !== null) {
    lastIndex = regex.lastIndex;
    const rawLang = (match[1] || '').trim().toLowerCase();
    const blockContent = match[2] || '';
    const beforeBlock = markdown.slice(0, match.index);
    processBlock(rawLang, blockContent, beforeBlock);
  }

  // Also check for trailing unclosed code block (e.g. truncated by token limit or in-flight stream)
  const remaining = markdown.slice(lastIndex);
  const unclosedMatch = remaining.match(/```(?:([a-zA-Z0-9_-]+))?[^\r\n]*\r?\n([\s\S]+)$/);
  if (unclosedMatch) {
    const rawLang = (unclosedMatch[1] || '').trim().toLowerCase();
    const blockContent = unclosedMatch[2] || '';
    const beforeBlock = markdown.slice(0, lastIndex + (unclosedMatch.index ?? 0));
    processBlock(rawLang, blockContent, beforeBlock);
  }

  return artifacts;
}
