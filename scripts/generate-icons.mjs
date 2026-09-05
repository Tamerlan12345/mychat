// Renders the Centras Chat app icon (blue rounded square with a white "C" ring) into
// PNG + ICO files for the web favicon, PWA manifest, Electron tray and the NSIS installer.
// Pure Node (zlib) — no image libraries needed, so the icon set is reproducible on any machine.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = buf => {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData));
  return Buffer.concat([len, typeData, crc]);
};

function encodePng(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Signed distance helpers (in unit coordinates, 0..1), evaluated with 4x4 supersampling.
const clamp01 = v => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a + (b - a) * t;

function roundedSquare(x, y, r) {
  const dx = Math.abs(x - 0.5) - (0.5 - r);
  const dy = Math.abs(y - 0.5) - (0.5 - r);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}

// The "C": a ring centred slightly right of the middle, with a 70° opening facing right.
function letterC(x, y) {
  const cx = 0.5;
  const cy = 0.5;
  const outer = 0.31;
  const inner = 0.175;
  const d = Math.hypot(x - cx, y - cy);
  const ring = Math.max(inner - d, d - outer);
  const angle = Math.atan2(y - cy, x - cx); // 0 = right
  const halfGap = (35 * Math.PI) / 180;
  const inGap = Math.abs(angle) < halfGap;
  if (!inGap) return ring;
  // Round the two terminals so the gap ends look like a drawn letter, not a cut.
  const mid = (inner + outer) / 2;
  const capR = (outer - inner) / 2;
  const capA = [Math.cos(halfGap) * mid + cx, Math.sin(halfGap) * mid + cy];
  const capB = [Math.cos(-halfGap) * mid + cx, Math.sin(-halfGap) * mid + cy];
  return Math.min(Math.hypot(x - capA[0], y - capA[1]), Math.hypot(x - capB[0], y - capB[1])) - capR;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const ss = 4;
  const edge = 1 / size; // one device pixel in unit space
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (i + (sx + 0.5) / ss) / size;
          const y = (j + (sy + 0.5) / ss) / size;
          const bg = roundedSquare(x, y, 0.22);
          if (bg > 0) continue;
          // Vertical gradient #3b82f6 -> #2563eb, slightly deeper toward the bottom-right.
          const t = clamp01(y * 0.85 + x * 0.15);
          let cr = mix(0x3b, 0x25, t), cg = mix(0x82, 0x63, t), cb = mix(0xf6, 0xeb, t);
          const c = letterC(x, y);
          const cover = clamp01(0.5 - c / (edge * 1.2));
          cr = mix(cr, 255, cover); cg = mix(cg, 255, cover); cb = mix(cb, 255, cover);
          r += cr; g += cg; b += cb; a += 1;
        }
      }
      const n = ss * ss;
      const o = (j * size + i) * 4;
      if (a === 0) continue;
      px[o] = Math.round(r / a);
      px[o + 1] = Math.round(g / a);
      px[o + 2] = Math.round(b / a);
      px[o + 3] = Math.round((a / n) * 255);
    }
  }
  return px;
}

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach(({ size, png }, idx) => {
    const o = idx * 16;
    dir[o] = size >= 256 ? 0 : size;
    dir[o + 1] = size >= 256 ? 0 : size;
    dir[o + 2] = 0;
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...entries.map(e => e.png)]);
}

// 24-bit bottom-up BMP (what NSIS expects for MUI sidebar/header bitmaps).
function encodeBmp(width, height, rgb) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buf = Buffer.alloc(54 + pixelBytes);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelBytes, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const si = (srcRow * width + x) * 3;
      const di = 54 + y * rowSize + x * 3;
      buf[di] = rgb[si + 2];
      buf[di + 1] = rgb[si + 1];
      buf[di + 2] = rgb[si];
    }
  }
  return buf;
}

// Brand gradient panel with the icon composited on top (used for NSIS sidebar and header).
function renderPanel(width, height, iconSize, iconX, iconY) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = clamp01((y / height) * 0.75 + (x / width) * 0.25);
      const o = (y * width + x) * 3;
      rgb[o] = Math.round(mix(0x1d, 0x1e, t) + (1 - t) * 20);
      rgb[o + 1] = Math.round(mix(0x4e, 0x3a, t) + (1 - t) * 20);
      rgb[o + 2] = Math.round(mix(0xd8, 0x8a, t) + (1 - t) * 10);
    }
  }
  const icon = render(iconSize);
  for (let j = 0; j < iconSize; j++) {
    for (let i = 0; i < iconSize; i++) {
      const x = iconX + i;
      const y = iconY + j;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const si = (j * iconSize + i) * 4;
      const a = icon[si + 3] / 255;
      if (a === 0) continue;
      const o = (y * width + x) * 3;
      rgb[o] = Math.round(mix(rgb[o], icon[si], a));
      rgb[o + 1] = Math.round(mix(rgb[o + 1], icon[si + 1], a));
      rgb[o + 2] = Math.round(mix(rgb[o + 2], icon[si + 2], a));
    }
  }
  return encodeBmp(width, height, rgb);
}

const pngs = Object.fromEntries([16, 24, 32, 48, 64, 128, 192, 256, 512].map(s => [s, encodePng(s, render(s))]));
const ico = encodeIco([16, 24, 32, 48, 64, 128, 256].map(size => ({ size, png: pngs[size] })));

mkdirSync(resolve(root, 'public'), { recursive: true });
mkdirSync(resolve(root, 'resources'), { recursive: true });
writeFileSync(resolve(root, 'public/favicon.ico'), ico);
writeFileSync(resolve(root, 'public/icon.png'), pngs[256]);
writeFileSync(resolve(root, 'public/icon-192.png'), pngs[192]);
writeFileSync(resolve(root, 'public/icon-512.png'), pngs[512]);
writeFileSync(resolve(root, 'resources/icon.ico'), ico);
writeFileSync(resolve(root, 'resources/icon.png'), pngs[512]);
// NSIS MUI artwork: 164×314 sidebar (welcome/finish pages) and 150×57 header (all other pages).
writeFileSync(resolve(root, 'resources/installerSidebar.bmp'), renderPanel(164, 314, 96, 34, 40));
writeFileSync(resolve(root, 'resources/installerHeader.bmp'), renderPanel(150, 57, 40, 98, 8));
console.log('icons written: public/favicon.ico, public/icon*.png, resources/icon.{ico,png}, resources/installer{Sidebar,Header}.bmp');
