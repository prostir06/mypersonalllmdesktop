/**
 * Recover UTF-8 filenames when Multer/Busboy mis-decodes them as latin1.
 * Already-correct Unicode (incl. Latin-1 Supplement like é) is left alone.
 */

function decodeMulterFilename(name) {
  if (name == null || name === '') return name;

  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 255) {
      return name;
    }
  }

  try {
    const recovered = Buffer.from(name, 'latin1').toString('utf8');
    const roundTrips =
      Buffer.from(recovered, 'utf8').toString('latin1') === name;
    const improved = recovered !== name;
    if (roundTrips && improved) {
      return recovered;
    }
    return name;
  } catch {
    return name;
  }
}

module.exports = { decodeMulterFilename };
