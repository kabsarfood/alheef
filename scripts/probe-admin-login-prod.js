/**
 * تحقق من مسار دخول الأدمن على Production (بدون طباعة أسرار).
 */
const BASE = process.env.SITE_URL || 'https://www.alheef.website';

async function getText(path) {
  const r = await fetch(`${BASE}${path}`, {
    signal: AbortSignal.timeout(20000),
    redirect: 'follow',
  });
  const text = await r.text();
  return { status: r.status, url: r.url, text };
}

async function postJson(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  return { status: r.status, text: text.replace(/\s+/g, ' ').slice(0, 220) };
}

function has(hay, ...needles) {
  return needles.some((n) => hay.includes(n));
}

(async () => {
  console.log('BASE', BASE);

  const dash = await getText('/dashboard/');
  const loginHtml = dash.text.includes('login-form')
    ? dash
    : await getText('/dashboard/login.html');
  console.log('login_page', loginHtml.status, 'url', loginHtml.url);

  const html = loginHtml.text;
  const checks = {
    phone_input: /id=["']phone["']/.test(html),
    whatsapp_primary_btn: has(html, 'إرسال رمز واتساب'),
    password_group_hidden_default: /id=["']password-group["'][^>]*hidden/.test(html) || /id=["']password-group["']\s+hidden/.test(html),
    password_fallback_toggle: has(html, 'دخول بكلمة المرور', 'toggle-password-login'),
    otp_form: /id=["']otp-form["']/.test(html),
    otp_verify_btn: has(html, 'تأكيد الرمز'),
  };
  console.log('html_checks', JSON.stringify(checks, null, 2));

  const loginJs = await getText('/dashboard/js/login.js?v=4');
  const js = loginJs.text;
  console.log('login.js', loginJs.status, 'len', js.length);
  const jsChecks = {
    otp_start_direct: js.includes('/api/auth/otp/start'),
    otp_verify: js.includes('/api/auth/otp/verify'),
    password_mode_toggle: js.includes('passwordMode') || js.includes('toggle-password-login'),
    default_password_mode_false: /setPasswordMode\(false\)/.test(js),
    admin_role_gate: /data\.role\s*!==\s*['"]admin['"]/.test(js) || /role !== 'admin'/.test(js),
    password_before_otp_required: /passwordMode[\s\S]{0,80}\/api\/auth\/otp\/start/.test(js) === false
      ? false
      : /if\s*\(\s*!passwordMode\s*\)[\s\S]*?\/api\/auth\/otp\/start/.test(js)
        ? false
        : /password[\s\S]{0,200}\/api\/auth\/otp\/start/.test(js),
  };
  // أوضح: هل OTP يُرسل بدون كلمة مرور؟
  jsChecks.otp_without_password =
    /if\s*\(\s*!passwordMode\s*\)\s*\{[\s\S]*?\/api\/auth\/otp\/start/.test(js);
  console.log('js_checks', JSON.stringify(jsChecks, null, 2));

  const apis = [
    await postJson('/api/auth/otp/start', { phone: '0500000000' }),
    await postJson('/api/auth/otp/verify', { challengeId: 'x', code: '000000' }),
    await postJson('/api/auth/login', { phone: '0500000000', password: 'x' }),
  ];
  console.log('api_otp_start', apis[0].status, apis[0].text);
  console.log('api_otp_verify', apis[1].status, apis[1].text);
  console.log('api_login_password', apis[2].status, apis[2].text);

  const newUi =
    checks.phone_input &&
    checks.whatsapp_primary_btn &&
    checks.password_group_hidden_default &&
    checks.password_fallback_toggle &&
    jsChecks.otp_start_direct &&
    jsChecks.otp_without_password &&
    jsChecks.admin_role_gate &&
    apis[0].status !== 404;

  const oldUi =
    apis[0].status === 404 ||
    (!checks.whatsapp_primary_btn && /type=["']password["']/.test(html));

  console.log('VERDICT', newUi ? 'NEW_FLOW_LIVE' : oldUi ? 'OLD_FLOW_LIVE' : 'MIXED_OR_PARTIAL');
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
