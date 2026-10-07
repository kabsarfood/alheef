const express = require('express');
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');
const gate = require('../services/mapApproval');
const submitLinks = require('../services/mapSubmitLink');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 6, fileSize: 8 * 1024 * 1024, fields: 12, fieldSize: 64 * 1024 },
});

const publicRouter = express.Router();
const adminRouter = express.Router();
adminRouter.use(requireAdmin);

function wantsJson(req) {
  return req.query.format === 'json' || /json/i.test(req.get('accept') || '');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[ch]));
}

function resultHtml(body) {
  const message = escapeHtml(body?.message || (body?.success ? 'تم إرسال الإعلان للموافقة' : 'تعذر إرسال الإعلان'));
  const number = body?.request_number ? `<p>رقم الطلب: ${escapeHtml(body.request_number)}</p>` : '';
  const state = body?.status === 'pending_approval' ? '<p>الحالة: بانتظار الموافقة</p>' : '';
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"></head><body style="font-family:sans-serif;padding:1.5rem;line-height:1.8"><p>${message}</p>${number}${state}</body></html>`;
}

function wantsHtmlResult(req) {
  const accept = String(req.get('accept') || '');
  if (/application\/json/i.test(accept)) return false;
  return /multipart\/form-data/i.test(String(req.get('content-type') || ''));
}

function sendSubmitResult(req, res, status, body) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  if (wantsHtmlResult(req)) return res.status(status).type('html').send(resultHtml(body));
  return res.status(status).json(body);
}

function sniffedDataUrl(file) {
  const buffer = file?.buffer;
  if (!buffer || !buffer.length) return '';
  let mime = '';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) mime = 'image/jpeg';
  else if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) mime = 'image/png';
  else if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
  if (!mime) return '';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function uploadErrorMessage(error) {
  if (error?.code === 'LIMIT_FILE_SIZE') return 'حجم الصورة يتجاوز الحد';
  if (error?.code === 'LIMIT_FILE_COUNT' || error?.code === 'LIMIT_UNEXPECTED_FILE') return 'الحد الأقصى 6 صور.';
  return 'تعذر قراءة الصور';
}

publicRouter.post('/one-time-submit/:code', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  const code = String(req.params.code || '');
  const codeHash = /^[A-Za-z0-9_-]{43}$/.test(code) ? submitLinks.hashCode(code) : 'invalid';
  if (!submitLinks.allow(req, codeHash)) {
    return sendSubmitResult(req, res, 429, { success: false, message: 'محاولات كثيرة. أعد المحاولة لاحقًا' });
  }
  const type = String(req.get('content-type') || '');
  const length = Number(req.get('content-length') || 0);
  const multipart = /multipart\/form-data/i.test(type);
  const limit = multipart ? 48 * 1024 * 1024 : 10 * 1024 * 1024;
  if (length > limit) {
    return sendSubmitResult(req, res, 413, { success: false, message: 'حجم الطلب يتجاوز الحد' });
  }
  if (!multipart) return next();
  return upload.array('images', 6)(req, res, (error) => {
    if (error) return sendSubmitResult(req, res, 400, { success: false, message: uploadErrorMessage(error) });
    const images = [];
    for (const file of req.files || []) {
      const dataUrl = sniffedDataUrl(file);
      if (!dataUrl) return sendSubmitResult(req, res, 400, { success: false, message: 'نوع الصورة غير مسموح' });
      images.push(dataUrl);
    }
    req.body = { ...(req.body || {}), images };
    return next();
  });
}, async (req, res) => {
  const code = String(req.params.code || '');
  try {
    console.info(JSON.stringify({
      scope: 'map-submit-link',
      at: new Date().toISOString(),
      images: Array.isArray(req.body?.images) ? req.body.images.length : 0,
      result: 'received',
    }));
    const outcome = await submitLinks.submitOnce(code, req.body || {});
    sendSubmitResult(req, res, outcome.status, outcome.body);
  } catch (error) {
    console.error('[map-submit-link]', gate.safeReason(error));
    sendSubmitResult(req, res, 500, { success: false, message: 'تعذر إرسال الإعلان' });
  }
});

publicRouter.post('/requests', async (req, res) => {
  if (!gate.rateLimiter.allowRequest(req)) {
    return res.status(429).json({ success: false, message: 'محاولات كثيرة. أعد المحاولة لاحقًا' });
  }
  const auth = gate.authorizeIntegration(req.get('authorization'));
  if (!auth.ok) return res.status(auth.status).json({ success: false, message: auth.message });
  try {
    const outcome = await gate.createRequest(req.body || {});
    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: status === 500 ? 'تعذر استقبال الطلب' : gate.safeReason(error) });
  }
});

publicRouter.post('/webhook', async (req, res) => {
  try {
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const outcome = await gate.acceptWebhook({
      rawBody: raw,
      signature: req.get('x-alheef-signature'),
      webhookToken: req.get('x-alheef-webhook-token'),
      body: req.body || {},
    });
    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error('[map-approval] webhook', gate.safeReason(error));
    res.status(500).json({ success: false, message: 'تعذر معالجة الويب هوك' });
  }
});

publicRouter.get('/decision', async (req, res) => {
  try {
    const outcome = await gate.decide({
      rid: String(req.query.rid || ''),
      act: String(req.query.act || ''),
      exp: String(req.query.exp || ''),
      sig: String(req.query.sig || ''),
      from: gate.adminPhone(),
    });
    if (wantsJson(req)) return res.status(outcome.status).json(outcome.body);
    const message = String(outcome.body.message || (outcome.body.success ? 'تم تسجيل القرار.' : 'تعذر تنفيذ القرار.'))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    res.status(outcome.status).type('html').send(`<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;padding:1.5rem"><p>${message}</p></body></html>`);
  } catch (error) {
    res.status(500).json({ success: false, message: 'تعذر تنفيذ القرار' });
  }
});

publicRouter.get('/preview', async (req, res) => {
  try {
    const loaded = await gate.loadPreview(req.query || {});
    const page = gate.previewHtml(loaded, req.query || {});
    res.status(page.status).type('html').send(page.html);
  } catch {
    res.status(500).type('html').send('<p dir="rtl">تعذر فتح المعاينة.</p>');
  }
});

publicRouter.get('/preview-image', async (req, res) => {
  try {
    const image = await gate.previewImage(req.query || {});
    if (!image) return res.status(404).end();
    if (image.redirect) return res.redirect(image.redirect);
    res.setHeader('Content-Type', image.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(image.buffer);
  } catch {
    res.status(404).end();
  }
});

adminRouter.post('/submit-links', async (req, res) => {
  try {
    const outcome = req.body?.reusable
      ? await submitLinks.createOpenSubmitLink()
      : await submitLinks.createSubmitLink();
    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    res.status(500).json({ success: false, message: gate.safeReason(error) });
  }
});

adminRouter.get('/submit-links', async (req, res) => {
  try {
    const outcome = await submitLinks.listSubmitLinks();
    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    res.status(500).json({ success: false, message: gate.safeReason(error) });
  }
});

adminRouter.post('/submit-links/:id/cancel', async (req, res) => {
  try {
    const outcome = await submitLinks.cancelSubmitLink(req.params.id);
    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    res.status(500).json({ success: false, message: gate.safeReason(error) });
  }
});

adminRouter.get('/', async (req, res) => {
  try {
    const items = await gate.listRequests(String(req.query.status || ''));
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: gate.safeReason(error) });
  }
});

adminRouter.post('/:id/cancel', async (req, res) => {
  try {
    const outcome = await gate.cancelRequest(String(req.params.id || ''));
    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    res.status(500).json({ success: false, message: gate.safeReason(error) });
  }
});

adminRouter.delete('/:id', async (req, res) => {
  try {
    const outcome = await gate.deleteRequest(String(req.params.id || ''));
    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    res.status(500).json({ success: false, message: gate.safeReason(error) });
  }
});

async function shortPage(req, res, action) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  try {
    const code = String(req.params.code || '');
    if (req.method === 'GET') {
      const state = await gate.shortLinkState(action, code);
      if (state === 'pending') return res.status(200).type('html').send(gate.confirmPage(action));
      if (state === 'missing') return res.status(404).type('html').send('<p dir="rtl">الرابط غير صالح.</p>');
    }
    const outcome = await gate.shortDecision(action, code);
    const page = gate.decisionPage(outcome);
    res.status(page.status).type('html').send(page.html);
  } catch (error) {
    console.error('[map-approval] short', gate.safeReason(error));
    res.status(500).type('html').send('<p dir="rtl">تعذر تنفيذ القرار.</p>');
  }
}

async function submitPage(req, res) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; connect-src 'self'; form-action 'self'; base-uri 'none'");
  try {
    const page = await submitLinks.pageForCode(String(req.params.code || ''));
    res.status(page.status).type('html').send(page.html);
  } catch (error) {
    console.error('[map-submit-link]', gate.safeReason(error));
    res.status(500).type('html').send('<p dir="rtl">تعذر فتح الرابط.</p>');
  }
}

module.exports = {
  publicRouter,
  adminRouter,
  shortApprove: (req, res) => shortPage(req, res, 'approve'),
  shortReject: (req, res) => shortPage(req, res, 'reject'),
  submitPage,
  shortOpen: async (req, res) => {
    try {
      const target = await gate.shortOpen(String(req.params.code || ''));
      if (!target) return res.status(404).type('html').send('<p dir="rtl">الرابط غير صالح.</p>');
      return res.redirect(302, target);
    } catch (error) {
      console.error('[map-approval] open', gate.safeReason(error));
      return res.status(500).type('html').send('<p dir="rtl">تعذر فتح الإعلان.</p>');
    }
  },
};
