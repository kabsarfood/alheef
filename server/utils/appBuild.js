/**
 * معرّف بناء التطبيق — يتغيّر مع كل نشر على Railway لتحديث كاش PWA
 */
function getAppBuild() {
  const sha = (process.env.RAILWAY_GIT_COMMIT_SHA || '').trim();
  if (sha) return sha.slice(0, 12);

  const deployId = (process.env.RAILWAY_DEPLOYMENT_ID || '').trim();
  if (deployId) return `d-${deployId.slice(0, 10)}`;

  const custom = (process.env.APP_BUILD_VERSION || '').trim();
  if (custom) return custom.slice(0, 24);

  try {
    const pkg = require('../../package.json');
    return `v${pkg.version}`;
  } catch {
    return 'v1';
  }
}

module.exports = { getAppBuild };
