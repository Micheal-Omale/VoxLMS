// Generates the VoxLMS logo assets: mark paths, outlined wordmark, lockups, icons.
// Run: npm i --no-save opentype.js@1 @fontsource/atkinson-hyperlegible-next && node scripts/brand/build-logo.cjs <out-dir>
// Then copy voxlms-*.svg to public/brand, icon.svg to src/app, and paste logo-data.json into
// src/components/brand/logo-paths.ts. PNGs (apple-icon, favicon) are rendered from the SVGs.
const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");
const { leafOnBase } = require("./leaf.cjs");

const OUT = process.argv[2];
const INK = "#16224A", BLUE = "#1F3FA8";
const r = (v) => +v.toFixed(2);

// ---- Mark: two pages joined at the spine, standing on a ruled line ----
// The blue right page lies over the ink left page; the seam between them is the spine.
const BASE = 41.5;
const rawL = leafOnBase([22, 47.5], [12.5, 34], [3, 19.5], 11.2, 10.2, BASE);
const rawR = leafOnBase([22, 47.5], [29, 23], [44.5, 4], 11.2, 9.6, BASE);
const pts = (d) => d.slice(1, -1).split("L").map((s) => s.split(" ").map(Number));
const all = [...pts(rawL), ...pts(rawR)];
const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
const MW = maxX - minX, MH = maxY - minY;
const shift = (d, dx, dy, s = 1) =>
  "M" + pts(d).map(([x, y]) => `${r((x + dx) * s)} ${r((y + dy) * s)}`).join("L") + "Z";
// Normalised to a 0-based box.
const L = shift(rawL, -minX, -minY), R = shift(rawR, -minX, -minY);

// ---- Wordmark ----
const font = opentype.loadSync(require.resolve("@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff"));
const capH = font.tables.os2.sCapHeight || 700;
const upm = font.unitsPerEm;
// Mark rises 26% above the caps, like a tick lifting off the line.
const fontSize = (MH / 1.26) * (upm / capH);
const em = fontSize;
// Optical tracking: tight on "Vox", open on the capitals "LMS".
const tracking = { V: -0.035, o: -0.02, x: 0.045, L: 0.03, M: 0.03, S: 0 };
const GAP = MH * 0.34; // mark-to-word space
let x = MW + GAP;
let word = "";
const chars = [..."VoxLMS"];
chars.forEach((ch, i) => {
  const glyph = font.charToGlyph(ch);
  const p = glyph.getPath(x, MH, fontSize);
  word += p.toPathData(2);
  let adv = (glyph.advanceWidth / upm) * fontSize;
  if (i < chars.length - 1) adv += (font.getKerningValue(glyph, font.charToGlyph(chars[i + 1])) / upm) * fontSize;
  x += adv + (tracking[ch] ?? 0) * em;
});
const wordMaxX = x - (tracking.S ?? 0) * em;
const LW = r(wordMaxX), LH = r(MH);

// ---- Writers ----
const svg = (w, h, body, title = "VoxLMS") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
const markBody = (a, b) => `<path d="${L}" fill="${a}"/><path d="${R}" fill="${b}"/>`;
const write = (name, content) => fs.writeFileSync(path.join(OUT, name), content);

// Pad the mark into a square for icons; optically centred (sits slightly low, like type on a line).
// In the tile the left page is a pale tint so the two pages (and the seam) still show.
const TILE_LEFT = "#BFCCF2";
const tile = (size, rx, bg, fg, pad = 0.22) => {
  const inner = size * (1 - pad * 2);
  const s = inner / Math.max(MW, MH);
  const dx = (size - MW * s) / 2, dy = (size - MH * s) / 2 + size * 0.015;
  return `<rect width="${size}" height="${size}" rx="${rx}" fill="${bg}"/>` +
    `<g transform="translate(${r(dx)} ${r(dy)}) scale(${r(s * 1000) / 1000})">${markBody(TILE_LEFT, fg)}</g>`;
};

fs.mkdirSync(OUT, { recursive: true });
write("voxlms-mark.svg", svg(MW, MH, markBody(INK, BLUE)));
write("voxlms-mark-black.svg", svg(MW, MH, markBody("#000", "#000")));
write("voxlms-mark-white.svg", svg(MW, MH, markBody("#FFF", "#FFF")));
write("voxlms-logo.svg", svg(LW, LH, markBody(INK, BLUE) + `<path d="${word}" fill="${INK}"/>`));
write("voxlms-logo-black.svg", svg(LW, LH, markBody("#000", "#000") + `<path d="${word}" fill="#000"/>`));
write("voxlms-logo-white.svg", svg(LW, LH, markBody("#FFF", "#FFF") + `<path d="${word}" fill="#FFF"/>`));
write("voxlms-app-icon.svg", svg(512, 512, tile(512, 112, BLUE, "#FFF")));
write("icon.svg", svg(32, 32, tile(32, 7, BLUE, "#FFF", 0.15)));

// Data for the React component.
write("logo-data.json", JSON.stringify({ markW: r(MW), markH: r(MH), L, R, word, logoW: LW, logoH: LH }, null, 0));
console.log({ MW: r(MW), MH: r(MH), LW, LH, fontSize: r(fontSize), capH, upm });
