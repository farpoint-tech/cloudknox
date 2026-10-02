/**
 * Generate PWA PNG icons with zero native dependencies.
 *
 * Draws a shield + checkmark (matching public/icon.svg) into an RGBA buffer and
 * encodes it as PNG using only Node's built-in zlib. Run: `npm run gen:icons`.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = [15, 23, 42]; // #0f172a
const FG = [56, 189, 248]; // #38bdf8

// Shield outline polygon (normalised 0..1) and checkmark segments.
const SHIELD = [
  [0.5, 0.15], [0.77, 0.26], [0.77, 0.53], [0.5, 0.87], [0.23, 0.53], [0.23, 0.26],
];
const CHECK = [
  [[0.37, 0.51], [0.47, 0.61]],
  [[0.47, 0.61], [0.65, 0.39]],
];

function distToSegment(px, py, a, b) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Minimum distance from a point to the closed shield polygon's edges.
function distToShield(px, py) {
  let min = Infinity;
  for (let i = 0; i < SHIELD.length; i++) {
    const a = SHIELD[i];
    const b = SHIELD[(i + 1) % SHIELD.length];
    min = Math.min(min, distToSegment(px, py, a, b));
  }
  return min;
}

function distToCheck(px, py) {
  let min = Infinity;
  for (const [a, b] of CHECK) min = Math.min(min, distToSegment(px, py, a, b));
  return min;
}

/**
 * Coverage of the foreground stroke at a normalised point (0..1), with padding
 * that insets the content (used for the maskable safe zone).
 */
function fgCoverage(nx, ny, strokeHalf, pad) {
  // Map the padded content box back to 0..1 shield space.
  const cx = (nx - pad) / (1 - 2 * pad);
  const cy = (ny - pad) / (1 - 2 * pad);
  if (cx < -0.2 || cx > 1.2 || cy < -0.2 || cy > 1.2) return 0;
  const d = Math.min(distToShield(cx, cy), distToCheck(cx, cy));
  // Anti-alias band of ~0.006 in normalised units.
  const aa = 0.006;
  return Math.max(0, Math.min(1, (strokeHalf + aa - d) / (2 * aa)));
}

function renderRGBA(size, { rounded, pad, strokeHalf }) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = rounded ? 0.18 * size : 0;
  const SS = 3; // supersample grid per pixel
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgCov = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          // Rounded-rect background mask.
          let inside = 1;
          if (rounded) {
            const rx = Math.min(fx, size - fx);
            const ry = Math.min(fy, size - fy);
            if (rx < radius && ry < radius) {
              const dx = radius - rx;
              const dy = radius - ry;
              inside = Math.hypot(dx, dy) <= radius ? 1 : 0;
            }
          }
          bgCov += inside;
          if (inside) fg += fgCoverage(fx / size, fy / size, strokeHalf, pad);
        }
      }
      const n = SS * SS;
      bgCov /= n;
      fg /= n;
      const i = (y * size + x) * 4;
      const a = Math.round(bgCov * 255);
      // Composite foreground stroke over background.
      const k = Math.min(1, fg);
      buf[i] = Math.round(BG[0] * (1 - k) + FG[0] * k);
      buf[i + 1] = Math.round(BG[1] * (1 - k) + FG[1] * k);
      buf[i + 2] = Math.round(BG[2] * (1 - k) + FG[2] * k);
      buf[i + 3] = a;
    }
  }
  return buf;
}

// --- minimal PNG encoder (RGBA, 8-bit) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // filter byte 0 per scanline
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function write(name, size, opts) {
  const rgba = renderRGBA(size, opts);
  writeFileSync(join(OUT, name), encodePNG(size, rgba));
  console.log(`wrote ${name} (${size}x${size})`);
}

write("icon-192.png", 192, { rounded: true, pad: 0.0, strokeHalf: 0.028 });
write("icon-512.png", 512, { rounded: true, pad: 0.0, strokeHalf: 0.028 });
// Maskable: full-bleed square, content inset into the ~80% safe zone.
write("icon-maskable-512.png", 512, { rounded: false, pad: 0.1, strokeHalf: 0.026 });
write("apple-touch-icon-180.png", 180, { rounded: true, pad: 0.06, strokeHalf: 0.03 });
