const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const gate = require('../services/mapApproval');

const publicRouter = express.Router();
const adminRouter = express.Router();
adminRouter.use(requireAdmin);

function wantsJson(req) {
  return req.query.format === 'json' || /json/i.test(req.get('accept') || '');
}

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
  try {
    const outcome = await gate.shortDecision(action, String(req.params.code || ''));
    const page = gate.decisionPage(outcome);
    res.status(page.status).type('html').send(page.html);
  } catch (error) {
    console.error('[map-approval] short', gate.safeReason(error));
    res.status(500).type('html').send('<p dir="rtl">تعذر تنفيذ القرار.</p>');
  }
}

module.exports = {
  publicRouter,
  adminRouter,
  shortApprove: (req, res) => shortPage(req, res, 'approve'),
  shortReject: (req, res) => shortPage(req, res, 'reject'),
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
