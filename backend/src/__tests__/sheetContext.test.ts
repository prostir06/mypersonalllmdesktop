import { parseSheetName } from '../services/chat/sheetContext';

describe('parseSheetName', () => {
  it('reads the first ## Sheet: line', () => {
    expect(parseSheetName('## Sheet: Sales\nA,1')).toBe('Sales');
  });

  it('returns undefined when there is no sheet header', () => {
    expect(parseSheetName('plain chunk')).toBeUndefined();
  });
});
