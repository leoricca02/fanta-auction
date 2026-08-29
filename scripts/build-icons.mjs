/**
 * Genera le icone PWA senza dipendenze grafiche: un piccolo encoder PNG e il
 * martelletto disegnato per distanza (le stesse forme dell'icona in header).
 *
 *   node scripts/build-icons.mjs
 *
 * Serve solo quando cambia il marchio: gli output sono versionati in public/.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// --- PNG ---------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** @param {Uint8Array} rgb pixel RGB in ordine riga per riga */
function png(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 3 + 1)] = 0; // filtro "none"
    Buffer.from(rgb.subarray(y * size * 3, (y + 1) * size * 3)).copy(
      raw,
      y * (size * 3 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- disegno -----------------------------------------------------------

/** Distanza con segno da un rettangolo arrotondato ruotato di `rot` radianti. */
function roundedBox(px, py, cx, cy, hw, hh, r, rot) {
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const dx = px - cx;
  const dy = py - cy;
  const x = Math.abs(dx * cos - dy * sin) - (hw - r);
  const y = Math.abs(dx * sin + dy * cos) - (hh - r);
  const outside = Math.hypot(Math.max(x, 0), Math.max(y, 0));
  return outside + Math.min(Math.max(x, y), 0) - r;
}

const EMERALD = [16, 185, 129];
const EMERALD_LIGHT = [52, 211, 153];
const BG_TOP = [17, 24, 21];
const BG_BOTTOM = [9, 9, 11];

const TILT = -Math.PI / 4; // il martelletto batte in diagonale, come in header

/** Colore del glifo in (x, y) normalizzati su [0,1], o null se fuori. */
function glyph(x, y) {
  // Manico: dalla testa in alto a destra verso il basso a sinistra.
  const handle = roundedBox(x, y, 0.44, 0.46, 0.235, 0.038, 0.038, TILT);
  // Testa del martelletto: perpendicolare al manico, appoggiata sulla punta.
  const head = roundedBox(x, y, 0.625, 0.275, 0.145, 0.072, 0.032, TILT + Math.PI / 2);
  // Basamento su cui batte.
  const base = roundedBox(x, y, 0.5, 0.775, 0.245, 0.043, 0.043, 0);

  const d = Math.min(handle, head, base);
  if (d > 0) return null;
  return d === head ? EMERALD_LIGHT : EMERALD;
}

function render(size) {
  const rgb = new Uint8Array(size * size * 3);
  const SS = 3; // supersampling: i bordi diagonali senza scaletta
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const t = py / (size - 1);
      const bg = BG_TOP.map((c, i) => c + (BG_BOTTOM[i] - c) * t);
      let acc = [0, 0, 0];
      let hits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const c = glyph((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          if (c !== null) {
            acc = acc.map((v, i) => v + c[i]);
            hits += 1;
          }
        }
      }
      const a = hits / (SS * SS);
      const fg = hits === 0 ? [0, 0, 0] : acc.map((v) => v / hits);
      const o = (py * size + px) * 3;
      for (let i = 0; i < 3; i += 1) rgb[o + i] = Math.round(bg[i] * (1 - a) + fg[i] * a);
    }
  }
  return png(size, rgb);
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(PUBLIC, name), render(size));
  console.log(`${name} (${size}x${size})`);
}
