/**
 * إعدادات الدخول والأسرار — تُقرأ من Environment فقط (بدون قيم Hardcoded).
 */

const UNSAFE_SECRETS = new Set([
  'alheef-admin-secret',
  'changeme',
  'secret',
  'admin',
  'password',
  '123456',
]);

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function trimEnv(name) {
  const v = process.env[name];
  return v == null ? '' : String(v).trim();
}

function isUnsafeSecret(value) {
  if (!value) return true;
  if (value.length < 12) return true;
  return UNSAFE_SECRETS.has(value.toLowerCase());
}

/**
 * سر توقيع التوكنات: ADMIN_SECRET فقط، أو ADMIN_PASSWORD كمرحلة انتقالية.
 * لا يوجد fallback ثابت في الكود.
 */
function getAuthSecret() {
  const dedicated = trimEnv('ADMIN_SECRET');
  if (dedicated) return dedicated;
  const password = trimEnv('ADMIN_PASSWORD');
  if (password) return password;
  return '';
}

function getAdminPhoneRaw() {
  return trimEnv('ADMIN_PHONE');
}

function hasAdminPasswordConfig() {
  return !!(trimEnv('ADMIN_PASSWORD_HASH') || trimEnv('ADMIN_PASSWORD'));
}

/**
 * يتحقق من الإعداد قبل تشغيل الخادم.
 * في الإنتاج: يتوقف فوراً عند نقص سر أساسي أو قيمة غير آمنة.
 * في التطوير: تحذير فقط (إلا إن طُلب fail عبر ALHEEF_STRICT_AUTH=1).
 */
function validateAuthConfig({ exitProcess = true } = {}) {
  const errors = [];
  const warnings = [];
  const prod = isProduction();
  const strict = prod || trimEnv('ALHEEF_STRICT_AUTH') === '1';

  const secret = getAuthSecret();
  const dedicatedSecret = trimEnv('ADMIN_SECRET');
  const phone = getAdminPhoneRaw();

  if (!secret) {
    errors.push('ADMIN_SECRET أو ADMIN_PASSWORD مطلوب لتوقيع جلسات الدخول');
  } else if (isUnsafeSecret(secret)) {
    errors.push('ADMIN_SECRET/ADMIN_PASSWORD قصير جداً أو قيمة افتراضية غير آمنة');
  }

  if (!dedicatedSecret) {
    warnings.push(
      'ADMIN_SECRET غير مضبوط — يُستخدم ADMIN_PASSWORD لتوقيع التوكن مؤقتاً. أنشئ ADMIN_SECRET منفصلاً في المتغيرات'
    );
  } else if (dedicatedSecret && trimEnv('ADMIN_PASSWORD') && dedicatedSecret === trimEnv('ADMIN_PASSWORD')) {
    warnings.push('ADMIN_SECRET مطابق لـ ADMIN_PASSWORD — يُفضّل سر توقيع مستقل');
  }

  if (!hasAdminPasswordConfig()) {
    errors.push('ADMIN_PASSWORD أو ADMIN_PASSWORD_HASH مطلوب لدخول لوحة الإدارة');
  }

  if (!phone) {
    errors.push('ADMIN_PHONE مطلوب — رقم الجوال المصرّح له بدخول لوحة الإدارة');
  }

  for (const w of warnings) {
    console.warn('[Auth]', w);
  }

  if (errors.length) {
    for (const e of errors) {
      console.error('[Auth] ✗', e);
    }
    if (strict && exitProcess) {
      console.error('[Auth] توقف التشغيل — أصلح المتغيرات ثم أعد التشغيل');
      process.exit(1);
    }
  }

  return { ok: errors.length === 0, errors, warnings, production: prod };
}

module.exports = {
  isProduction,
  getAuthSecret,
  getAdminPhoneRaw,
  hasAdminPasswordConfig,
  isUnsafeSecret,
  validateAuthConfig,
};
