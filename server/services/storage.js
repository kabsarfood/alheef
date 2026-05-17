const path = require('path');
const { getAdmin, isEnabled } = require('../lib/supabase');

const BUCKET = 'alheef-assets';

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function contentType(filename) {
  return MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

async function ensureBucket() {
  const admin = getAdmin();
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets || []).some((b) => b.name === BUCKET || b.id === BUCKET);
  if (exists) return;

  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 8 * 1024 * 1024,
  });

  if (error && !/already exists/i.test(error.message)) {
    console.warn('[Storage] تعذر إنشاء bucket:', error.message);
  } else {
    console.log('[Storage] ✓ bucket:', BUCKET);
  }
}

/**
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {'logos'|'banners'|'properties'|'news'} folder
 */
async function uploadBuffer(buffer, originalName, folder = 'properties') {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  await ensureBucket();

  const ext = path.extname(originalName || '.jpg').toLowerCase() || '.jpg';
  const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const objectPath = `${folder}/${safeName}`;

  const admin = getAdmin();
  const { error } = await admin.storage.from(BUCKET).upload(objectPath, buffer, {
    contentType: contentType(originalName),
    upsert: false,
  });

  if (error) {
    console.error('[Storage] upload error:', error.message);
    throw new Error('فشل رفع الملف إلى التخزين');
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  console.log('[Storage] ✓ uploaded:', objectPath);
  return data.publicUrl;
}

async function uploadFiles(files, folder) {
  const urls = [];
  for (const file of files || []) {
    if (file?.buffer?.length) {
      urls.push(await uploadBuffer(file.buffer, file.originalname, folder));
    }
  }
  return urls;
}

module.exports = {
  BUCKET,
  uploadBuffer,
  uploadFiles,
  ensureBucket,
};
