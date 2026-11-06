// Downloads character portraits from the Foundry server and resizes them to 480px WebP.
// Run: npm run portraits   (then npm run content so the data picks them up)

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { slug } from "./content-rules.mjs";

const FOUNDRY = "https://foundry.thenatural20tavern.com";
const OUT = "src/assets/img/out/portraits";
const { portraitMap } = JSON.parse(readFileSync("content-raw/overrides.json", "utf8"));
mkdirSync(OUT, { recursive: true });

for (const [name, path] of Object.entries(portraitMap)) {
  const url = `${FOUNDRY}/${path.split("/").map(encodeURIComponent).join("/")}`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const webp = await sharp(buf).resize(480, 480, { fit: "cover", position: "attention" }).webp({ quality: 72 }).toBuffer();
    writeFileSync(`${OUT}/${slug(name)}.webp`, webp);
    console.log(`ok   ${name} (${Math.round(webp.length / 1024)} KB)`);
  } catch (e) {
    console.log(`fail ${name}: ${e.message}`);
  }
}
