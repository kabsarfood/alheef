/**
 * معرّف بناء التطبيق. يتغيّر فقط مع نشر تطوير للموقع،
 * ولا يتغيّر عند جلب إعلان أو إضافته أو إعادة تشغيل العملية.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let cachedBuild = null;

function readGitSha() {
  try {
    const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    const ref = head.startsWith('ref:') ? head.slice(5).trim() : '';
    const sha = ref
      ? fs.readFileSync(path.join(ROOT, '.git', ref), 'utf8').trim()
      : head;
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 12) : '';
  } catch {
    return '';
  }
}

function getAppBuild() {
  if (cachedBuild) return cachedBuild;

  const sha = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').trim();
  if (/^[0-9a-f]{7,40}$/i.test(sha)) {
    cachedBuild = sha.slice(0, 12);
    return cachedBuild;
  }

  const fromGit = readGitSha();
  if (fromGit) {
    cachedBuild = fromGit;
    return cachedBuild;
  }

  const custom = (process.env.APP_BUILD_VERSION || '').trim();
  cachedBuild = custom ? custom.slice(0, 24) : 'alheef-app';
  return cachedBuild;
}

module.exports = { getAppBuild };
