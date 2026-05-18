console.log('STEP 1 — بدء تحميل server.js');

try {
  require('dotenv').config();
  console.log('STEP 2 — dotenv جاهز');
} catch (err) {
  console.warn('STEP 2 — dotenv تحذير:', err.message);
}

const path = require('path');
const fs = require('fs');

console.log('STEP 3 — تحميل express والمسارات');

let express;
let cors;
let apiRoutes;
let adminRoutes;
let authRoutes;
let initSupabase;
let pingSupabase;

try {
  express = require('express');
  cors = require('cors');
  apiRoutes = require('./server/routes/api');
  adminRoutes = require('./server/routes/admin');
  authRoutes = require('./server/routes/auth');
  ({ initSupabase, ping: pingSupabase } = require('./server/lib/supabase'));
  console.log('STEP 4 — الحزم والمسارات محمّلة بنجاح');
} catch (err) {
  console.error('STEP 4 — فشل التحميل:', err);
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const ROOT = __dirname;
const publicDir = path.join(ROOT, 'public');
const dashboardDir = path.join(ROOT, 'dashboard');

console.log('STEP 5 — Supabase');
console.log('  PORT:', PORT);
console.log('  NODE_ENV:', process.env.NODE_ENV || 'development');
initSupabase();

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

if (fs.existsSync(dashboardDir)) {
  app.use('/dashboard', express.static(dashboardDir));
  console.log('  static /dashboard ✓');
}

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  console.log('  static /public ✓');
} else {
  console.warn('  تحذير: مجلد public غير موجود');
}

console.log('STEP 7 — ربط API');

app.get('/health', async (_req, res) => {
  const supabase = await pingSupabase();
  res.status(200).json({
    ok: true,
    service: 'alheef',
    port: PORT,
    uptime: process.uptime(),
    supabase,
  });
});

app.use('/api/auth', authRoutes);
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
    if (req.path.startsWith('/dashboard')) {
      return sendDashboardPage(res, req.path);
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
});
