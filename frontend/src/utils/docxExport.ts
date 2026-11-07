type DocxModule = typeof import('docx');

export function sanitizeDocxFilename(title?: string): string {
  if (!title || !title.trim()) {
    return 'document.docx';
  }
  const strippedExtension = title.trim().replace(/\.docx$/i, '');
  const cleaned = strippedExtension
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) {
    return 'document.docx';
  }
  return `${cleaned}.docx`;
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl: string, text: string) =>
      `\n${'#'.repeat(Number(lvl))} ${text.trim()}\n\n`
    )
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text: string) => `\n${text.trim()}\n\n`)
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, c: string) =>
      `\n${c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, item: string) => `- ${item.trim()}\n`).replace(/<[^>]+>/g, '')}\n`
    )
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, c: string) => {
      let idx = 1;
      return `\n${c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, item: string) => `${idx++}. ${item.trim()}\n`).replace(/<[^>]+>/g, '')}\n`;
    })
    .replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, c: string) => {
      const rows: string[][] = [];
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch: RegExpExecArray | null;
      while ((trMatch = trRegex.exec(c)) !== null) {
        const cells: string[] = [];
        const cellRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(trMatch[1])) !== null) {
          cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
        }
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length === 0) return '';
      const [first, ...rest] = rows;
      const header = `| ${first.join(' | ')} |\n| ${first.map(() => '---').join(' | ')} |\n`;
      return `\n${header}${rest.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n');
}

function parseInlineRuns(
  docx: DocxModule,
  text: string,
  baseOpts: { bold?: boolean; italics?: boolean } = {}
): InstanceType<DocxModule['TextRun']>[] {
  const INLINE_REGEX =
    /(?:`([^`]+)`|<code>([\s\S]*?)<\/code>|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|<strong>([\s\S]*?)<\/strong>|<b>([\s\S]*?)<\/b>|\*([^*]+)\*|_([^_]+)_|<em>([\s\S]*?)<\/em>|<i>([\s\S]*?)<\/i>)/g;
  const runs: InstanceType<DocxModule['TextRun']>[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(
        new docx.TextRun({
          text: text.slice(lastIndex, match.index),
          bold: baseOpts.bold,
          italics: baseOpts.italics,
        })
      );
    }

    const code = match[1] ?? match[2];
    const boldItalic = match[3];
    const bold = match[4] ?? match[5] ?? match[6];
    const italic = match[7] ?? match[8] ?? match[9] ?? match[10];

    if (code !== undefined) {
      runs.push(
        new docx.TextRun({
          text: code,
          font: 'Courier New',
          bold: baseOpts.bold,
          italics: baseOpts.italics,
        })
      );
    } else if (boldItalic !== undefined) {
      runs.push(
        new docx.TextRun({
          text: boldItalic,
          bold: true,
          italics: true,
        })
      );
    } else if (bold !== undefined) {
      runs.push(
        new docx.TextRun({
          text: bold,
          bold: true,
          italics: baseOpts.italics,
        })
      );
    } else if (italic !== undefined) {
      runs.push(
        new docx.TextRun({
          text: italic,
          bold: baseOpts.bold,
          italics: true,
        })
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push(
      new docx.TextRun({
        text: text.slice(lastIndex),
        bold: baseOpts.bold,
        italics: baseOpts.italics,
      })
    );
  }

  if (runs.length === 0) {
    runs.push(new docx.TextRun({ text: '', ...baseOpts }));
  }

  return runs;
}

function parseMarkdownToDocxChildren(
  docx: DocxModule,
  rawContent: string
): (InstanceType<DocxModule['Paragraph']> | InstanceType<DocxModule['Table']>)[] {
  let content = rawContent;
  if (/<[a-z][\s\S]*>/i.test(content)) {
    content = htmlToMarkdown(content);
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const children: (InstanceType<DocxModule['Paragraph']> | InstanceType<DocxModule['Table']>)[] = [];
  let i = 0;

  const cellBorder = {
    style: docx.BorderStyle.SINGLE,
    size: 1,
    color: 'CCCCCC',
  };
  const cellBorders = {
    top: cellBorder,
    bottom: cellBorder,
    left: cellBorder,
    right: cellBorder,
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Code block
    if (trimmed.startsWith('```')) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      for (const cl of codeLines) {
        children.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({
                text: cl || ' ',
                font: 'Courier New',
              }),
            ],
            shading: {
              type: docx.ShadingType.CLEAR,
              fill: 'F5F5F5',
            },
          })
        );
      }
      continue;
    }

    // Markdown Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length > 0) {
        let isFirstRowHeader = false;
        let rowsToProcess = tableLines;

        if (
          tableLines.length >= 2 &&
          /^\|(?:\s*:?-+:?\s*\|)+$/.test(tableLines[1])
        ) {
          isFirstRowHeader = true;
          rowsToProcess = [tableLines[0], ...tableLines.slice(2)];
        }

        const tableRows = rowsToProcess.map((r, rowIndex) => {
          const cells = r
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim());
          const isHeader = isFirstRowHeader && rowIndex === 0;

          return new docx.TableRow({
            tableHeader: isHeader,
            children: cells.map(
              (cellText) =>
                new docx.TableCell({
                  children: [
                    new docx.Paragraph({
                      children: parseInlineRuns(docx, cellText, { bold: isHeader }),
                    }),
                  ],
                  shading: isHeader
                    ? {
                        type: docx.ShadingType.CLEAR,
                        fill: 'F0F0F0',
                      }
                    : undefined,
                  borders: cellBorders,
                })
            ),
          });
        });

        children.push(
          new docx.Table({
            width: {
              size: 100,
              type: docx.WidthType.PERCENTAGE,
            },
            rows: tableRows,
          })
        );
      }
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingMap = [
        docx.HeadingLevel.HEADING_1,
        docx.HeadingLevel.HEADING_2,
        docx.HeadingLevel.HEADING_3,
        docx.HeadingLevel.HEADING_4,
        docx.HeadingLevel.HEADING_5,
        docx.HeadingLevel.HEADING_6,
      ];
      children.push(
        new docx.Paragraph({
          heading: headingMap[level - 1] || docx.HeadingLevel.HEADING_1,
          children: parseInlineRuns(docx, headingMatch[2]),
          spacing: { before: 200, after: 100 },
        })
      );
      i++;
      continue;
    }

    // Unordered list
    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const level = Math.min(Math.floor(indent / 2), 8);
      children.push(
        new docx.Paragraph({
          bullet: { level },
          children: parseInlineRuns(docx, bulletMatch[2]),
        })
      );
      i++;
      continue;
    }

    // Ordered list
    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (orderedMatch) {
      const indent = orderedMatch[1].length;
      const level = Math.min(Math.floor(indent / 2), 8);
      children.push(
        new docx.Paragraph({
          numbering: {
            reference: 'ordered-list',
            level,
          },
          children: parseInlineRuns(docx, orderedMatch[2]),
        })
      );
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      children.push(
        new docx.Paragraph({
          indent: { left: 720 },
          children: parseInlineRuns(docx, trimmed.replace(/^>\s*/, ''), { italics: true }),
        })
      );
      i++;
      continue;
    }

    // Regular paragraph
    children.push(
      new docx.Paragraph({
        children: parseInlineRuns(docx, trimmed),
        spacing: { after: 120 },
      })
    );
    i++;
  }

  return children;
}

export async function buildDocxBuffer(
  content: string,
  title?: string
): Promise<Uint8Array> {
  const docx = await import('docx');
  const children = parseMarkdownToDocxChildren(docx, content);

  const doc = new docx.Document({
    title: title || undefined,
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: Array.from({ length: 9 }, (_, lvl) => ({
            level: lvl,
            format: docx.LevelFormat.DECIMAL,
            text: `%${lvl + 1}.`,
            alignment: docx.AlignmentType.START,
          })),
        },
      ],
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const arrayBuffer = await docx.Packer.toArrayBuffer(doc);
  return new Uint8Array(arrayBuffer);
}

export async function downloadArtifactAsDocx(
  content: string,
  title?: string
): Promise<void> {
  const bytes = await buildDocxBuffer(content, title);
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const filename = sanitizeDocxFilename(title);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
