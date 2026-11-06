// Builds the site's images from the source art. Run: npm run images
//   src/assets/img/src/barovia.png -> out/bg-barovia.webp (about 200 KB), out/og-card.jpg (1200x630)
//   favicon.svg -> out/apple-touch-icon.png

import { mkdirSync, readFileSync, statSync } from "node:fs";
import sharp from "sharp";

const SRC = "src/assets/img/src/barovia.png";
const OUT = "src/assets/img/out";
mkdirSync(OUT, { recursive: true });

await sharp(SRC).resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 68 }).toFile(`${OUT}/bg-barovia.webp`);

const title = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0d0b0e" stop-opacity="0.35"/><stop offset="1" stop-color="#0d0b0e" stop-opacity="0.9"/>
  </linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="600" y="330" text-anchor="middle" font-family="Georgia, serif" font-size="84" font-weight="700" fill="#e63946">The Natural 20 Tavern</text>
  <text x="600" y="400" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="#efe3c8">Curse of Strahd · the final chapter</text>
</svg>`);
await sharp(SRC).resize(1200, 630, { fit: "cover", position: "centre" }).composite([{ input: title }]).jpeg({ quality: 82, mozjpeg: true }).toFile(`${OUT}/og-card.jpg`);

await sharp(readFileSync("src/assets/img/favicon.svg")).resize(180, 180).png().toFile(`${OUT}/apple-touch-icon.png`);

for (const f of ["bg-barovia.webp", "og-card.jpg", "apple-touch-icon.png"]) {
  console.log(`${f}: ${Math.round(statSync(`${OUT}/${f}`).size / 1024)} KB`);
}
