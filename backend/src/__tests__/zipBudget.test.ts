import { zipUncompressedBytes, ExtractionLimitError, MAX_DECOMPRESSED_BYTES } from '../services/documents/extraction';

function zipClaimingSize(uncompressed: number): Buffer {
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(uncompressed, 24);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46, 12);
  eocd.writeUInt32LE(0, 16);
  return Buffer.concat([central, eocd]);
}

describe('zipUncompressedBytes', () => {
  it('reads the central-directory uncompressed size', () => {
    expect(zipUncompressedBytes(zipClaimingSize(120))).toBe(120);
    expect(zipUncompressedBytes(Buffer.from('plain'))).toBeNull();
  });

  it('flags an oversized archive', () => {
    const inflated = zipUncompressedBytes(zipClaimingSize(MAX_DECOMPRESSED_BYTES + 1));
    expect(inflated).toBeGreaterThan(MAX_DECOMPRESSED_BYTES);
    expect(new ExtractionLimitError('Файл розпаковується занадто великим').name).toBe(
      'ExtractionLimitError'
    );
  });
});
