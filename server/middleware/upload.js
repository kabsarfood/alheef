const multer = require('multer');
const path = require('path');

const memoryStorage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  const allowed = /jpeg|jpg|png|webp/i;
  const ok =
    allowed.test(path.extname(file.originalname)) && allowed.test(file.mimetype);
  cb(ok ? null : new Error('نوع الملف غير مدعوم'), ok);
}

const uploadMemory = multer({
  storage: memoryStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter,
});

const uploadPublic = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter,
});

module.exports = { uploadMemory, uploadPublic };
