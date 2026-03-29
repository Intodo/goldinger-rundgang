const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');

const TOUR_URL = 'https://rundgang.goldinger.ch/VzBD';
const OUTPUT_DIR = path.join(__dirname, 'tour-data');
const WAIT_TIME = 120000; // 2 Minuten warten damit alles lädt

const downloaded = new Set();

function sanitizePath(urlStr) {
  const parsed = url.parse(urlStr);
  let filePath = parsed.pathname;
  if (!filePath || filePath === '/') filePath = '/index.html';
  // Pfade die mit / enden bekommen index.html
  if (filePath.endsWith('/')) filePath += 'index.html';
  return path.join(OUTPUT_DIR, parsed.hostname, filePath);
}

function downloadFile(fileUrl) {
  return new Promise((resolve) => {
    if (downloaded.has(fileUrl)) return resolve();
    downloaded.add(fileUrl);

    const dest = sanitizePath(fileUrl);
    const dir = path.dirname(dest);

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(dest)) return resolve();

    const proto = fileUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);

    proto.get(fileUrl, { headers: { 'Referer': 'https://rundgang.goldinger.ch/' } }, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('✓', fileUrl.replace('https://', ''));
          resolve();
        });
      } else {
        file.close();
        fs.unlink(dest, () => {});
        resolve();
      }
    }).on('error', () => resolve());
  });
}

(async () => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Browser wird gestartet...');
  const browser = await chromium.launch({ headless: false }); // sichtbar damit du die Tour navigieren kannst
  const context = await browser.newContext();
  const page = await context.newPage();

  const assetQueue = [];

  // Alle Netzwerk-Requests abfangen
  page.on('response', async (response) => {
    const reqUrl = response.url();
    if (!reqUrl.startsWith('http')) return;
    if (response.status() !== 200) return;
    // Tracking/Analytics überspringen
    if (reqUrl.includes('google-analytics') || reqUrl.includes('googletagmanager') ||
        reqUrl.includes('analytics') || reqUrl.includes('sentry.io') ||
        reqUrl.includes('hotjar') || reqUrl.includes('facebook')) return;
    assetQueue.push(reqUrl);
  });

  console.log('Tour wird geladen: ' + TOUR_URL);
  console.log('⚠️  WICHTIG: Navigiere jetzt manuell durch ALLE Räume der Tour!');
  console.log('Das Skript wartet ' + (WAIT_TIME/1000) + ' Sekunden und speichert dabei alle Assets.');
  console.log('');

  await page.goto(TOUR_URL, { waitUntil: 'networkidle', timeout: 60000 });

  // Warten damit der Nutzer durch die Tour navigieren kann
  await page.waitForTimeout(WAIT_TIME);

  console.log('\nAssets werden heruntergeladen...');
  for (const assetUrl of assetQueue) {
    await downloadFile(assetUrl);
  }

  await browser.close();

  console.log('\n✅ Fertig! ' + downloaded.size + ' Dateien gespeichert in: ' + OUTPUT_DIR);
})();
