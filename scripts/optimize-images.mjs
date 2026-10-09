// 원본 PNG(assets-src/original) → 웹 배포용 WebP(public/img)
// 카드(2:3)는 640×960, 배경(16:9)은 1600폭, 투명 소품은 320폭으로 줄인다.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'assets-src/original';
const OUT = 'public/img';
fs.mkdirSync(OUT, { recursive: true });
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.png'));
let total = 0;
for (const f of files) {
  const name = f.replace(/\.png$/, '');
  let pipe = sharp(path.join(SRC, f));
  let quality = 78;
  if (name.startsWith('background_')) pipe = pipe.resize({ width: 1600 });
  else if (name.startsWith('token_') || name.startsWith('emblem_')) { pipe = pipe.resize({ width: 320 }); quality = 85; }
  else pipe = pipe.resize({ width: 640, height: 960, fit: 'cover' });
  const out = path.join(OUT, name + '.webp');
  await pipe.webp({ quality, effort: 5 }).toFile(out);
  const sz = fs.statSync(out).size; total += sz;
  console.log(name.padEnd(32), (sz / 1024).toFixed(0) + 'KB');
}
console.log('합계', (total / 1024 / 1024).toFixed(2) + 'MB', files.length + '개');
