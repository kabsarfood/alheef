#!/usr/bin/env node
/**
 * توليد أيقونات PWA — رمز فيلا (بدون حروف) بدون تبعيات خارجية
 * خلفية كحلية داكنة + فيلا ذهبية فاخرة
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'assets');
const NAVY = [30, 42, 56];
const GOLD = [197, 164, 109];
const GOLD_LIGHT = [212, 184, 138];

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

/**
 * تحديد لون البكسل: يعيد null إذا خلفية، أو مصفوفة RGB للفيلا.
 * الإحداثيات nx,ny مطبّعة داخل صندوق الرسم [0..1].
 */
function villaColor(nx, ny) {
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;

  const half = Math.abs(nx - 0.5);

  // ── السقف (مثلث بحواف بارزة) ──
  const roofTop = 0.06;
  const roofBase = 0.40;
  let inRoof = false;
  if (ny >= roofTop && ny <= roofBase) {
    const t = (ny - roofTop) / (roofBase - roofTop);
    const roofHalf = 0.10 + t * 0.36; // يتسع من القمة للأسفل، حتى 0.46 (حواف بارزة)
    if (half <= roofHalf) inRoof = true;
  }

  // ── جسم الفيلا ──
  const bodyTop = 0.40;
  const bodyBottom = 0.95;
  const bodyHalf = 0.34;
  const inBody = ny >= bodyTop && ny <= bodyBottom && half <= bodyHalf;

  if (!inRoof && !inBody) return null;

  // ── الفتحات (تُقتطع بلون الخلفية) ──
  // الباب — مركزي بقوس علوي
  const doorHalf = 0.085;
  const doorTop = 0.62;
  const doorBottom = 0.95;
  if (half <= doorHalf && ny >= doorTop && ny <= doorBottom) {
    // قوس علوي للباب
    const archCenter = doorTop + doorHalf;
    if (ny >= archCenter) return null;
    const dx = nx - 0.5;
    const dy = ny - archCenter;
    if (dx * dx + dy * dy <= doorHalf * doorHalf) return null;
  }

  // نافذتان جانبيتان
  const winHalf = 0.075;
  const winTop = 0.52;
  const winBottom = 0.66;
  for (const cxWin of [0.29, 0.71]) {
    if (Math.abs(nx - cxWin) <= winHalf && ny >= winTop && ny <= winBottom) {
      return null;
    }
  }

  // نافذة علوية صغيرة في السقف (كوّة)
  const dormerHalf = 0.055;
  if (half <= dormerHalf && ny >= 0.26 && ny <= 0.37) return null;

  // تدرّج لوني خفيف: السقف أفتح قليلاً لإحساس فخم
  return inRoof && !inBody ? GOLD_LIGHT : GOLD;
}

function drawIcon(size, maskable) {
  const raw = Buffer.alloc(size * size * 4 + size);
  const artScale = maskable ? 0.60 : 0.76;
  const artSize = size * artScale;
  const ax = (size - artSize) / 2;
  const ay = (size - artSize) / 2;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const i = rowStart + 1 + x * 4;
      let color = NAVY;
      const nx = (x - ax) / artSize;
      const ny = (y - ay) / artSize;
      const villa = villaColor(nx, ny);
      if (villa) color = villa;
      raw[i] = color[0];
      raw[i + 1] = color[1];
      raw[i + 2] = color[2];
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

/** ملف .ico يضمّن صورة PNG بحجم 32×32 */
function writeIco(fileName, size = 32) {
  const png = drawIcon(size, false);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(1, 4); // count

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // width
  entry[1] = size >= 256 ? 0 : size; // height
  entry[2] = 0; // color palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8); // size of PNG data
  entry.writeUInt32LE(6 + 16, 12); // offset to PNG data

  fs.writeFileSync(path.join(OUT, fileName), Buffer.concat([header, entry, png]));
  console.log('✓', fileName);
}

write('icon-192.png', 192, false);
write('icon-512.png', 512, false);
write('icon-maskable-512.png', 512, true);
write('apple-touch-icon.png', 180, false);
write('favicon-32.png', 32, false);
write('favicon.png', 192, false);
write('favicon-16.png', 16, false);
write('favicon-48.png', 48, false);
write('favicon-512.png', 512, false);
writeIco('favicon.ico', 32);
console.log('تم توليد أيقونات الفيلا لتطبيق الهيف');
