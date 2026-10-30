import ExcelJS from 'exceljs';
import { extractText } from '../services/documents/extraction';

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
