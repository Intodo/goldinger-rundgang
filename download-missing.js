const https = require('https');
const fs = require('fs');
const path = require('path');

const TOUR_ID = 'dc19acf5-2c01-4f9c-a859-7b18a9c3cb4f';
const BUCKET = 'live-alpha-ogulo.s3.eu-central-1.amazonaws.com';
const BASE_URL = `https://${BUCKET}/tours/${TOUR_ID}`;
const DATA_DIR = path.join(__dirname, 'tour-data', BUCKET, 'tours', TOUR_ID);
const FACES = ['b', 'd', 'f', 'l', 'r', 'u'];

function downloadFile(fileUrl, dest) {
  return new Promise((resolve) => {
    if (fs.existsSync(dest)) return resolve(true);
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });
    const file = fs.createWriteStream(dest);
    https.get(fileUrl, { headers: { 'Referer': 'https://rundgang.goldinger.ch/' } }, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
      } else {
        file.close();
        fs.unlink(dest, () => {});
        resolve(false);
      }
    }).on('error', () => { fs.unlink(dest, () => {}); resolve(false); });
  });
}

(async () => {
  const panoIds = fs.readdirSync(DATA_DIR).filter(f => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(f));
  console.log(`${panoIds.length} Panos gefunden`);

  const queue = [];

  for (const panoId of panoIds) {
    const tilesBase = path.join(DATA_DIR, panoId, 'panos', `${panoId}.tiles`);
    const urlBase = `${BASE_URL}/${panoId}/panos/${panoId}.tiles`;

    for (const face of FACES) {
      // Level 1: 1×1 Tile
      queue.push({
        url: `${urlBase}/${face}/l1/1/l1_${face}_1_1.jpg`,
        dest: path.join(tilesBase, face, 'l1', '1', `l1_${face}_1_1.jpg`)
      });
      // Level 2: 2×2 Tiles
      for (let x = 1; x <= 2; x++) {
        for (let y = 1; y <= 2; y++) {
          queue.push({
            url: `${urlBase}/${face}/l2/${x}/l2_${face}_${x}_${y}.jpg`,
            dest: path.join(tilesBase, face, 'l2', String(x), `l2_${face}_${x}_${y}.jpg`)
          });
        }
      }
    }
  }

  const missing = queue.filter(f => !fs.existsSync(f.dest));
  console.log(`${missing.length} fehlende Tiles (von ${queue.length} gesamt)`);

  let done = 0, ok = 0;
  // 8 parallele Downloads
  const PARALLEL = 8;
  for (let i = 0; i < missing.length; i += PARALLEL) {
    const batch = missing.slice(i, i + PARALLEL);
    const results = await Promise.all(batch.map(f => downloadFile(f.url, f.dest)));
    ok += results.filter(Boolean).length;
    done += batch.length;
    process.stdout.write(`\r${done}/${missing.length} (${ok} OK)`);
  }

  console.log(`\n✅ Fertig! ${ok} Dateien heruntergeladen`);
})();
