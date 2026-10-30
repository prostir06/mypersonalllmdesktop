import ExcelJS from 'exceljs';
import { extractText, formatCellValue } from '../services/documents/extraction';

async function xlsxBuffer(rows: unknown[][], sheetName = 'Data'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRows(rows);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('xlsx extraction (ExcelJS)', () => {
  it('reads sheet rows as CSV with sheet header', async () => {
    const buffer = await xlsxBuffer(
      [
        ['Product', 'Qty'],
        ['Apples', 10],
      ],
      'Inventory'
    );

    const text = await extractText(
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'stock.xlsx'
    );

    expect(text).toContain('## Sheet: Inventory');
    expect(text).toMatch(/Product,Qty/);
    expect(text).toMatch(/Apples,10/);
  });

  it('extracts formula results, dates, richText, and quotes cells containing commas or quotes', async () => {
    const testDate = new Date('2026-10-30T10:00:00.000Z');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Complex');

    ws.addRow(['DateCol', 'FormulaCol', 'RichTextCol', 'CommaCol', 'QuoteCol']);
    const row2 = ws.addRow([]);
    row2.getCell(1).value = testDate;
    row2.getCell(2).value = { formula: '1+2', result: 3 };
    row2.getCell(3).value = {
      richText: [
        { text: 'Hello ' },
        { font: { bold: true }, text: 'World' },
      ],
    };
    row2.getCell(4).value = 'Apples, Oranges';
    row2.getCell(5).value = 'He said "Hello"';

    const arrayBuffer = await wb.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const text = await extractText(
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'complex.xlsx'
    );

    expect(text).toContain('## Sheet: Complex');
    expect(text).toContain(testDate.toISOString());
    expect(text).toContain('3');
    expect(text).toContain('Hello World');
    expect(text).toContain('"Apples, Oranges"');
    expect(text).toContain('"He said ""Hello"""');
  });

  describe('formatCellValue', () => {
    it('handles null and undefined', () => {
      expect(formatCellValue(null)).toBe('');
      expect(formatCellValue(undefined)).toBe('');
    });

    it('formats dates as ISO strings', () => {
      const d = new Date('2026-10-30T12:00:00.000Z');
      expect(formatCellValue(d)).toBe('2026-10-30T12:00:00.000Z');
    });

    it('extracts formula result', () => {
      expect(formatCellValue({ formula: 'SUM(A1:A5)', result: 42 })).toBe('42');
      expect(formatCellValue({ formula: 'CONCAT(A1,B1)', result: 'foo, bar' })).toBe('"foo, bar"');
    });

    it('extracts rich text array', () => {
      expect(
        formatCellValue({
          richText: [{ text: 'Part1 ' }, { text: 'Part2' }],
        })
      ).toBe('Part1 Part2');
    });

    it('extracts text object property', () => {
      expect(formatCellValue({ text: 'Hyperlink label', hyperlink: 'https://example.com' })).toBe(
        'Hyperlink label'
      );
    });

    it('escapes quotes and wraps with commas or quotes', () => {
      expect(formatCellValue('simple')).toBe('simple');
      expect(formatCellValue('one, two')).toBe('"one, two"');
      expect(formatCellValue('say "hi"')).toBe('"say ""hi"""');
      expect(formatCellValue('multi\nline')).toBe('"multi\nline"');
    });
  });

  it('rejects a ZIP that is not a readable workbook', async () => {
    await expect(
      extractText(
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'broken.xlsx'
      )
    ).rejects.toThrow(/Excel/i);
  });
});
