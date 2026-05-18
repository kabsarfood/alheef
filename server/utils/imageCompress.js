let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

const DEFAULT_OPTS = { width: 1920, quality: 82, format: 'webp' };

async function compressImage(buffer, opts = {}) {
  const { width, quality, format } = { ...DEFAULT_OPTS, ...opts };
  if (!sharp || !buffer?.length) return buffer;

  try {
    let pipeline = sharp(buffer).rotate();
    const meta = await pipeline.metadata();
    if (meta.width && meta.width > width) {
      pipeline = pipeline.resize({ width, withoutEnlargement: true });
    }
    if (format === 'webp') {
      return pipeline.webp({ quality }).toBuffer();
    }
    if (format === 'jpeg') {
      return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    }
    return pipeline.png({ compressionLevel: 9 }).toBuffer();
  } catch (err) {
    console.warn('[imageCompress]', err.message);
    return buffer;
  }
}

function outputName(originalName, format = 'webp') {
  const ext = format === 'jpeg' ? '.jpg' : format === 'png' ? '.png' : '.webp';
  const base = (originalName || 'image').replace(/\.[^.]+$/, '');
  return `${base}${ext}`;
}

module.exports = { compressImage, outputName, sharpAvailable: !!sharp };
