const { decodeMulterFilename } = require('../../src/utils/multerFilename')

describe('decodeMulterFilename', () => {
  it('keeps already-correct UTF-8 Cyrillic filenames', () => {
    expect(decodeMulterFilename('звіт.pdf')).toBe('звіт.pdf')
  })

  it('recovers latin1-mojibake filenames into UTF-8', () => {
    // Simulate Multer giving a latin1-misdecoded string for UTF-8 bytes of "звіт.pdf"
    const mojibake = Buffer.from('звіт.pdf', 'utf8').toString('latin1')
    expect(decodeMulterFilename(mojibake)).toBe('звіт.pdf')
  })

  it('returns empty/undefined names unchanged', () => {
    expect(decodeMulterFilename('')).toBe('')
    expect(decodeMulterFilename(undefined)).toBeUndefined()
  })

  it('keeps already-correct accented Latin filenames', () => {
    expect(decodeMulterFilename('café.pdf')).toBe('café.pdf')
    expect(decodeMulterFilename('señor.txt')).toBe('señor.txt')
  })
})
