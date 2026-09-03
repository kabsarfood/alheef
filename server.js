console.log('STEP 1 — بدء تحميل server.js');

try {
  require('dotenv').config();
  console.log('STEP 2 — dotenv جاهز');
} catch (err) {
  console.warn('STEP 2 — dotenv تحذير:', err.message);
}

/** Windows محلي — إعادة التشغيل بشهادات النظام لتفادي fetch failed مع Supabase */
if (
  process.platform === 'win32' &&
  process.env.NODE_ENV !== 'production' &&
  !process.env.ALHEEF_SKIP_SYSTEM_CA &&
  !process.execArgv.some((a) => a.includes('use-system-ca'))
) {
  const { spawnSync } = require('child_process');
  console.log('[SSL] Windows — إعادة التشغيل بشهادات النظام (--use-system-ca)');
  const result = spawnSync(process.execPath, ['--use-system-ca', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? (result.error ? 1 : 0));
}

const path = require('path');
const fs = require('fs');

console.log('STEP 3 — تحميل express والمسارات');

let express;
let cors;
let apiRoutes;
let adminRoutes;
let authRoutes;
let marketerRoutes;
let pushRoutes;
let privateOffersRoutes;
let analyticsRoutes;
let ejarReviewsRoutes;
let ejarContractsRoutes;
let initSupabase;
let pingSupabase;

try {
  express = require('express');
  cors = require('cors');
  apiRoutes = require('./server/routes/api');
  adminRoutes = require('./server/routes/admin');
  authRoutes = require('./server/routes/auth');
  marketerRoutes = require('./server/routes/marketer');
  pushRoutes = require('./server/routes/push');
  privateOffersRoutes = require('./server/routes/privateOffers');
  analyticsRoutes = require('./server/routes/analytics');
  ejarReviewsRoutes = require('./server/routes/ejarReviews');
  ejarContractsRoutes = require('./server/routes/ejarContracts');
  ({ initSupabase, ping: pingSupabase } = require('./server/lib/supabase'));
  console.log('STEP 4 — الحزم والمسارات محمّلة بنجاح');
} catch (err) {
  console.error('STEP 4 — فشل التحميل:', err);
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';

/** Liveness — سريع، بدون Supabase (لـ Railway Healthcheck) */
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'alheef',
    time: new Date().toISOString(),
  });
});

const ROOT = __dirname;
const publicDir = path.join(ROOT, 'public');
const dashboardDir = path.join(ROOT, 'dashboard');
const marketerDir = path.join(ROOT, 'marketer');
const { getAppBuild } = require('./server/utils/appBuild');
const { PRIVATE_PAGE_RE } = require('./server/utils/privateOffersPath');

console.log('STEP 5 — Supabase');
console.log('  PORT:', PORT);
console.log('  NODE_ENV:', process.env.NODE_ENV || 'development');
const supabaseReady = initSupabase();
if (supabaseReady) {
  const { ensureBuckets } = require('./server/services/storage');
  ensureBuckets().catch((err) => console.warn('[Storage] تهيئة buckets:', err.message));
  try {
    require('./server/services/pushNotifications').initVapid();
  } catch (err) {
    console.warn('[Push] تهيئة VAPID:', err.message);
  }
  const { applyMigrationsIfNeeded } = require('./server/lib/sqlMigrations');
  applyMigrationsIfNeeded({ silent: false })
    .then((r) => {
      if (r.applied) console.log('[Schema] ✓ تم تفعيل جداول فريق المسوقين وطلبات الانضمام');
      else if (r.skipped === 'no_password') {
        console.warn('[Schema] ⚠ لإرسال طلبات «كن أحد فريق الهيف» أضف SUPABASE_DB_PASSWORD في المتغيرات');
      }
    })
    .catch((err) => console.warn('[Schema] هجرة:', err.message));
} else {
  console.warn('  ⚠ بدون Supabase: النماذج والعروض من الداشبورد لن تُحفظ في القاعدة');
}

console.log('STEP 6 — إعداد middleware');

// إعادة توجيه النطاق بدون www → www (بعد ربط DNS للنطاقين على نفس الخادم)
app.use((req, res, next) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  if (host === 'alheef.website') {
    return res.redirect(301, `https://www.alheef.website${req.originalUrl || '/'}`);
  }
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/** PWA — معرّف البناء و Service Worker ديناميكي (يتغيّر مع كل نشر) */
app.get('/api/pwa-meta', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ build: getAppBuild(), name: 'مكتب الهيف للخدمات العقارية' });
});

app.get('/sw.js', (_req, res) => {
  const swPath = path.join(publicDir, 'sw.js');
  if (!fs.existsSync(swPath)) return res.status(404).send('Not found');
  const build = getAppBuild();
  const content = fs.readFileSync(swPath, 'utf8').replace(/__APP_BUILD__/g, build);
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  res.send(content);
});

/** لا تخزّن صفحات HTML في المتصفح — لضمان وصول التحديثات */
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const p = req.path;
  if (p.endsWith('.html') || p === '/manifest.webmanifest') {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return next();
  }
  if (!path.extname(p) && !p.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});

function sendPrivateOffersPage(req, res) {
  const pagePath = path.join(publicDir, 'private-offers.html');
  if (!fs.existsSync(pagePath)) {
    return res.status(404).send('الصفحة غير موجودة');
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  let html = fs.readFileSync(pagePath, 'utf8');
  const origin = `${req.protocol}://${req.get('host')}`;
  html = html.replace(/content="\/assets\/app-icon\.png(\?v=\d+)?"/g, `content="${origin}/assets/app-icon.png?v=6"`);
  return res.type('html').send(html);
}

/** العروض الخاصة — قبل static لضمان عدم إعادة التوجيه للصفحة الرئيسية */
app.get(PRIVATE_PAGE_RE, (req, res) => sendPrivateOffersPage(req, res));

if (fs.existsSync(dashboardDir)) {
  app.use('/dashboard', express.static(dashboardDir));
  console.log('  static /dashboard ✓');
}

if (fs.existsSync(marketerDir)) {
  app.use('/marketer', express.static(marketerDir));
  console.log('  static /marketer ✓');
}

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  console.log('  static /public ✓');
} else {
  console.warn('  تحذير: مجلد public غير موجود');
}

console.log('STEP 7 — ربط API');

app.get('/health/ready', async (_req, res) => {
  const supabase = await pingSupabase();
  res.status(supabase.ok ? 200 : 503).json({
    ok: supabase.ok,
    service: 'alheef',
    port: PORT,
    uptime: process.uptime(),
    supabase,
    site: 'https://www.alheef.website',
    dashboard: '/dashboard/login.html',
  });
});

app.use('/api/push', pushRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/private-offers', privateOffersRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/marketer', marketerRoutes);
app.use('/api/ejar', ejarContractsRoutes);
app.use('/api/ejar', ejarReviewsRoutes);
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/config', async (_req, res) => {
  try {
    const { getContactConfig } = require('./server/utils/settings');
    res.json(await getContactConfig());
  } catch (err) {
    console.error('[config]', err.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل الإعدادات' });
  }
});

function sendMarketerPage(res, requestPath) {
  const base = path.resolve(marketerDir);
  let fileName = 'index.html';
  if (requestPath && requestPath !== '/marketer' && requestPath !== '/marketer/') {
    const segment = requestPath.replace(/^\/marketer\/?/, '');
    const safe = path.basename(segment);
    if (safe && safe.endsWith('.html')) fileName = safe;
  }
  const filePath = path.resolve(base, fileName);
  if (!filePath.startsWith(base)) return res.status(400).send('مسار غير صالح');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  return res.sendFile(path.join(base, 'index.html'));
}

function sendDashboardPage(res, requestPath) {
  const base = path.resolve(dashboardDir);
  let fileName = 'index.html';

  if (requestPath && requestPath !== '/dashboard' && requestPath !== '/dashboard/') {
    const segment = requestPath.replace(/^\/dashboard\/?/, '');
    const safe = path.basename(segment);
    if (safe && safe.endsWith('.html')) {
      fileName = safe;
    }
  }

  const filePath = path.resolve(base, fileName);
  if (!filePath.startsWith(base)) {
    return res.status(400).send('مسار غير صالح');
  }

  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  return res.sendFile(path.join(base, 'index.html'));
}

app.get('*', (req, res, next) => {
  try {
    if (req.path.startsWith('/marketer')) {
      return sendMarketerPage(res, req.path);
    }
    if (req.path.startsWith('/dashboard')) {
      return sendDashboardPage(res, req.path);
    }

    if (PRIVATE_PAGE_RE.test(req.path)) {
      return sendPrivateOffersPage(res);
    }

    if (/^\/ejar\/review\/[A-Za-z0-9_-]{20,128}$/.test(req.path)) {
      const reviewPage = path.join(publicDir, 'ejar-review.html');
      if (fs.existsSync(reviewPage)) return res.sendFile(reviewPage);
    }

    const pageMap = {
      '/map': 'map.html',
      '/map.html': 'map.html',
      '/property': 'property.html',
      '/property.html': 'property.html',
      '/ejar': 'ejar.html',
      '/ejar.html': 'ejar.html',
    };
    const pageFile = pageMap[req.path];
    if (pageFile) {
      const pagePath = path.join(publicDir, pageFile);
      if (fs.existsSync(pagePath)) return res.sendFile(pagePath);
    }

    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    res.status(404).send('الصفحة غير موجودة');
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error('خطأ في الطلب:', err);
  if (!res.headersSent) {
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
});

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

console.log('STEP 8 — SERVER STARTING...');

app.listen(PORT, HOST, () => {
  console.log(`الهيف — الخادم يعمل على المنفذ ${PORT}`);
  console.log(`الاستماع على ${HOST}:${PORT}`);
  console.log('Health check: GET /health');

  const { expireLicenses } = require('./server/repositories/propertiesRepo');
  const pushNotifications = require('./server/services/pushNotifications');
  const runExpire = () => {
    expireLicenses().then(({ count, items }) => {
      if (count > 0) {
        console.log(`[expireLicenses] تم تحديث ${count} إعلان منتهي الترخيص`);
        items.forEach((item) => {
          if (!item.marketerId) return;
          pushNotifications.notifyMarketerPropertyReview({
            marketerId: item.marketerId,
            propertyId: item.id,
            action: 'expired',
            title: 'انتهى ترخيص إعلانك',
            feedback: item.title || item.district || '',
          }).catch((err) => console.warn('[push] expire:', err.message));
        });
      }
    }).catch((err) => {
      const msg = String(err?.message || err);
      if (/fetch failed/i.test(msg)) {
        console.warn('[expireLicenses] تعذر الاتصال بـ Supabase مؤقتاً — سيُعاد المحاولة لاحقاً');
      } else {
        console.warn('[expireLicenses]', msg);
      }
    });
  };
  setTimeout(runExpire, 2500);
  setInterval(runExpire, 60 * 60 * 1000);
});
