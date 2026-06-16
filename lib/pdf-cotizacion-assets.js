const fs = require('fs');
const path = require('path');

/** No versionado en git — copiar manualmente desde frontend/public/:
 *  assets/branding/flising-logo-blanco.png
 *  assets/cotizacion-activos/{sedan|suv|...}_blanco.png
 */
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const cache = new Map();

const leerBase64 = (rutaRelativa) => {
  if (cache.has(rutaRelativa)) return cache.get(rutaRelativa);

  const rutaAbs = path.join(ASSETS_DIR, rutaRelativa);
  if (!fs.existsSync(rutaAbs)) {
    cache.set(rutaRelativa, null);
    return null;
  }

  const buf = fs.readFileSync(rutaAbs);
  const ext = path.extname(rutaAbs).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
  const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
  cache.set(rutaRelativa, dataUri);
  return dataUri;
};

const logoFlisingBase64 = () => leerBase64('branding/flising-logo-blanco.png');

const imagenActivoBase64 = (nombreArchivo) => leerBase64(`cotizacion-activos/${nombreArchivo}`);

module.exports = {
  logoFlisingBase64,
  imagenActivoBase64,
};
