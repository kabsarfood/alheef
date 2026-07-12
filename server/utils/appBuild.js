/**
 * معرّف بناء التطبيق — يتغيّر مع كل نشر لتحديث كاش PWA
 */
const BOOT_BUILD = `boot-${Date.now().toString(36)}`;
let cachedBuild = null;

function getAppBuild() {
  if (cachedBuild) return cachedBuild;

  const sha = (process.env.RAILWAY_GIT_COMMIT_SHA || '').trim();
  if (sha) {
    cachedBuild = sha.slice(0, 12);
    return cachedBuild;
  }

  const deployId = (process.env.RAILWAY_DEPLOYMENT_ID || '').trim();
  if (deployId) {
    cachedBuild = `d-${deployId.slice(0, 10)}`;
    return cachedBuild;
  }

  const custom = (process.env.APP_BUILD_VERSION || '').trim();
  if (custom) {
    cachedBuild = custom.slice(0, 24);
    return cachedBuild;
  }

  cachedBuild = BOOT_BUILD;
  return cachedBuild;
}

module.exports = { getAppBuild };
