const path = require('path');
const { getAdmin, isEnabled } = require('../lib/supabase');
const { compressImage, outputName } = require('../utils/imageCompress');

const BUCKETS = {
  assets: 'alheef-assets',
  properties: 'property-images',
  banners: 'banners',
  logos: 'logos',
  news: 'news',
  privateOffers: 'alheef-assets',
};

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
};

const BUCKET_FILE_LIMIT = 32 * 1024 * 1024;
let bucketsReady = false;

function contentType(filename) {
  return MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

function resolveBucket(folder) {
  if (folder === 'properties' || folder === 'property') return BUCKETS.properties;
  if (folder === 'banners' || folder === 'banner') return BUCKETS.banners;
  if (folder === 'logos' || folder === 'logo') return BUCKETS.logos;
  if (folder === 'news') return BUCKETS.news;
  if (folder === 'private-offers' || folder === 'private_offers') return BUCKETS.privateOffers;
  return BUCKETS.assets;
}

async function ensureBuckets() {
  if (bucketsReady) return;
  const admin = getAdmin();
  const names = Object.values(BUCKETS);
  const { data: buckets } = await admin.storage.listBuckets();
  const existing = new Set((buckets || []).map((b) => b.name || b.id));

  for (const name of names) {
    if (!existing.has(name)) {
      const { error } = await admin.storage.createBucket(name, {
        public: true,
        fileSizeLimit: BUCKET_FILE_LIMIT,
      });
      if (error && !/already exists/i.test(error.message)) {
        console.warn('[Storage] bucket', name, error.message);
      }
      continue;
    }
    const { error } = await admin.storage.updateBucket(name, {
      fileSizeLimit: BUCKET_FILE_LIMIT,
    });
    if (error && !/not found|does not exist/i.test(error.message || '')) {
      console.warn('[Storage] update bucket', name, error.message);
    }
  }
  bucketsReady = true;
}

async function uploadBuffer(buffer, originalName, folder = 'assets', options = {}) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  await ensureBuckets();

  const compress = options.compress !== false;
  let body = buffer;
  let name = originalName || 'file.jpg';
  const type = contentType(name);

  if (compress && /^image\/(jpeg|png|webp)$/i.test(type)) {
    body = await compressImage(buffer, options.compressOpts);
    name = outputName(originalName, 'webp');
  }

  const bucket = resolveBucket(folder);
  const ext = path.extname(name).toLowerCase() || '.webp';
  const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const objectPath = `${folder}/${safeName}`;

  const admin = getAdmin();
  const { error } = await admin.storage.from(bucket).upload(objectPath, body, {
    contentType: contentType(name),
    upsert: false,
  });

  if (error) {
    console.error('[Storage] upload:', error.message);
    throw new Error('فشل رفع الملف');
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

async function uploadFiles(files, folder, options = {}) {
  const urls = [];
  for (const file of files || []) {
    if (file?.buffer?.length) {
      urls.push(await uploadBuffer(file.buffer, file.originalname, folder, options));
    }
  }
  return urls;
}

module.exports = {
  BUCKETS,
  uploadBuffer,
  uploadFiles,
  ensureBuckets,
  resolveBucket,
};
