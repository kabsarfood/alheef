const express = require('express');
const { createRateLimiter } = require('../utils/rateLimit');
const oauth = require('../services/chatgptOAuth');

const router = express.Router();
const limit = createRateLimiter({ max: 30, windowMs: 10 * 60 * 1000 });

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function sendJson(res, status, body) {
  res.set('Cache-Control', 'no-store');
  res.status(status).json(body);
}

function authorizePage(query, message) {
  const fields = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']
    .map((name) => `<input type="hidden" name="${name}" value="${esc(query[name] || '')}">`)
    .join('');
  const login = `/dashboard/?return=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(query).toString()}`)}`;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>ربط ChatGPT بالهيف ماب</title>
  <style>
    body { margin: 0; font-family: Tahoma, sans-serif; background: #f4f1ea; color: #1c1915; }
    main { max-width: 32rem; margin: 8vh auto; padding: 1.5rem; background: #fff; border-radius: 16px; }
    button, a { display: inline-block; margin-top: 1rem; background: #1f6b4a; color: #fff; text-decoration: none; border: 0; border-radius: 999px; padding: .75rem 1.2rem; }
    p { line-height: 1.7; }
    .err { color: #8d2b2b; }
  </style>
</head>
<body>
  <main>
    <h1>ربط ChatGPT</h1>
    <p>يسمح هذا الربط لـ ChatGPT بإنشاء طلب خريطة بانتظار موافقة واتساب. لا ينشر الإعلان ولا يرى مفتاح الخادم.</p>
    ${message ? `<p class="err">${esc(message)}</p>` : ''}
    <form method="post" action="/oauth/authorize">
      ${fields}
      <input type="hidden" name="admin_token" id="admin_token" value="">
      <button type="submit">السماح لـ ChatGPT</button>
    </form>
    <p><a href="${esc(login)}">تسجيل دخول الأدمن</a></p>
  </main>
  <script>
    var token = localStorage.getItem('alheef_admin_token') || '';
    document.getElementById('admin_token').value = token;
  </script>
</body>
</html>`;
}

router.get('/.well-known/oauth-protected-resource', (_req, res) => {
  sendJson(res, 200, oauth.protectedResourceMetadata());
});

router.get('/.well-known/oauth-protected-resource/api/integrations/alheef-map/mcp', (_req, res) => {
  sendJson(res, 200, oauth.protectedResourceMetadata());
});

router.get('/.well-known/oauth-authorization-server', (_req, res) => {
  sendJson(res, 200, oauth.authorizationServerMetadata());
});

router.get('/oauth/authorize', async (req, res) => {
  if (!limit.allowRequest(req)) return sendJson(res, 429, { error: 'temporarily_unavailable' });
  try {
    const parsed = await oauth.beginAuthorize(req.query);
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'DENY');
    if (parsed.error && oauth.isAllowedRedirect(req.query.redirect_uri)) {
      const target = oauth.errorRedirect(req.query.redirect_uri, parsed.error, req.query.state);
      if (target) return res.redirect(302, target);
    }
    if (parsed.error) return sendJson(res, 400, { error: parsed.error });
    res.type('html').send(authorizePage(req.query, ''));
  } catch (error) {
    sendJson(res, error.status || 500, { error: 'server_error' });
  }
});

router.post('/oauth/authorize', async (req, res) => {
  if (!limit.allowRequest(req)) return sendJson(res, 429, { error: 'temporarily_unavailable' });
  try {
    const result = await oauth.grantConsent(req.body || {}, req.body?.admin_token);
    if (!result.ok) {
      res.set('Cache-Control', 'no-store');
      res.set('Referrer-Policy', 'no-referrer');
      if (result.error === 'login_required') {
        return res.status(401).type('html').send(authorizePage(req.body || {}, 'سجّل دخول الأدمن ثم اسمح لـ ChatGPT'));
      }
      const target = oauth.errorRedirect(req.body?.redirect_uri, result.error, req.body?.state);
      if (target) return res.redirect(302, target);
      return sendJson(res, result.status || 400, { error: result.error || 'invalid_request' });
    }
    res.redirect(302, result.redirect);
  } catch (error) {
    sendJson(res, error.status || 500, { error: 'server_error' });
  }
});

router.post('/oauth/token', async (req, res) => {
  if (!limit.allowRequest(req)) return sendJson(res, 429, { error: 'temporarily_unavailable' });
  try {
    const body = req.body || {};
    const grant = String(body.grant_type || '');
    const result = grant === 'refresh_token'
      ? await oauth.refreshTokens(body)
      : await oauth.exchangeCode(body);
    sendJson(res, result.status, result.body);
  } catch (error) {
    sendJson(res, error.status || 500, { error: 'server_error' });
  }
});

router.post('/oauth/register', async (req, res) => {
  if (!limit.allowRequest(req)) return sendJson(res, 429, { error: 'temporarily_unavailable' });
  try {
    const result = await oauth.registerClient(req.body || {});
    sendJson(res, result.status, result.body);
  } catch (error) {
    sendJson(res, error.status || 500, { error: 'server_error' });
  }
});

module.exports = router;
