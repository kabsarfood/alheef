const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const leads = require('../services/offerLeads');

const adminRouter = express.Router();
adminRouter.use(requireAdmin);

adminRouter.get('/', async (_req, res) => {
  try {
    const items = await leads.listForAdmin();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'تعذر تحميل المتابعة' });
  }
});

adminRouter.put('/:id/negotiating', async (req, res) => {
  try {
    const outcome = await leads.setNegotiating(String(req.params.id || ''));
    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    res.status(500).json({ success: false, message: 'تعذر تحديث الحالة' });
  }
});

adminRouter.put('/clients/:id/followup', async (req, res) => {
  try {
    const outcome = await leads.setFollowupPaused(String(req.params.id || ''), req.body?.paused === true);
    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    res.status(500).json({ success: false, message: 'تعذر تحديث المتابعة' });
  }
});

function sendPage(req, res, page) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.status(page.status).type('html').send(page.html);
}

async function choicePage(req, res) {
  try {
    const code = String(req.params.code || '');
    const page = req.method === 'GET'
      ? await leads.openChoice(code)
      : await leads.decideChoice(code);
    sendPage(req, res, page);
  } catch (error) {
    console.warn('[offer-leads] choice failed');
    res.status(500).type('html').send('<p dir="rtl">تعذر تنفيذ الاختيار.</p>');
  }
}

module.exports = { adminRouter, choicePage };
