#!/usr/bin/env node
/**
 * توليد أيقونات PWA بدون تبعيات خارجية
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'assets');
const NAVY = [30, 42, 56];
const GOLD = [197, 164, 109];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function drawIcon(size, maskable) {
  const pad = Math.round(maskable ? size * 0.18 : size * 0.08);
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - pad * 2) / 2;
  const raw = Buffer.alloc((size * size * 4) + size);

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const i = rowStart + 1 + x * 4;
      let r = NAVY[0]; let g = NAVY[1]; let b = NAVY[2];
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        r = GOLD[0]; g = GOLD[1]; b = GOLD[2];
        const lw = radius * 0.38;
        const lh = radius * 0.42;
        const lx = cx - lw / 2;
        const ly = cy - lh / 2 + radius * 0.04;
        if (
          (x >= lx && x < lx + lw * 0.22 && y >= ly && y < ly + lh)
          || (x >= lx + lw * 0.38 && x < lx + lw * 0.6 && y >= ly && y < ly + lh)
          || (x >= lx && x < lx + lw && y >= ly && y < ly + lh * 0.2)
        ) {
          r = NAVY[0]; g = NAVY[1]; b = NAVY[2];
        }
      }
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(fileName, size, maskable) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, fileName), drawIcon(size, maskable));
  console.log('✓', fileName);
}

write('icon-192.png', 192, false);
write('icon-512.png', 512, false);
write('icon-maskable-512.png', 512, true);
write('favicon-32.png', 32, false);
write('favicon.png', 192, false);
write('apple-touch-icon.png', 180, false);
console.log('تم توليد أيقونات PWA');
