import XLSX from 'xlsx';
import { extractText } from '../services/documents/extraction';

function xlsxBuffer(rows: unknown[][], sheetName = 'Data'): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('xlsx extraction (SheetJS)', () => {
  it('reads sheet rows as CSV with sheet header', async () => {
    const buffer = xlsxBuffer(
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
