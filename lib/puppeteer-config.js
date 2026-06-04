const fs = require('fs');
const puppeteer = require('puppeteer');

const RUTAS_CHROME_SISTEMA = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

const resolverEjecutableChrome = async () => {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const ruta = process.env.PUPPETEER_EXECUTABLE_PATH.trim();
    if (!fs.existsSync(ruta)) {
      throw new Error(`PUPPETEER_EXECUTABLE_PATH no existe: ${ruta}`);
    }
    return ruta;
  }

  try {
    const empaquetado = await puppeteer.executablePath();
    if (typeof empaquetado === 'string' && fs.existsSync(empaquetado)) return empaquetado;
  } catch {
    // Puppeteer aún no tiene Chrome descargado en cache
  }

  const delSistema = RUTAS_CHROME_SISTEMA.find((ruta) => fs.existsSync(ruta));
  if (delSistema) return delSistema;

  return null;
};

const opcionesLanzamientoPuppeteer = async () => {
  const executablePath = await resolverEjecutableChrome();
  if (!executablePath) {
    throw new Error(
      'Chrome no encontrado para generar PDF. Ejecuta en CRM: npm run pdf:install-chrome\n'
      + 'O define PUPPETEER_EXECUTABLE_PATH en .env apuntando al binario de Chrome/Chromium.',
    );
  }

  return {
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  };
};

module.exports = {
  resolverEjecutableChrome,
  opcionesLanzamientoPuppeteer,
};
