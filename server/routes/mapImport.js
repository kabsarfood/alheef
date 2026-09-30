const express = require('express');
const { authorizeImport, importProperty } = require('../services/mapImport');

const router = express.Router();

router.post('/import-property', async (req, res) => {
  const auth = authorizeImport(req.get('authorization'));
  if (!auth.ok) return res.status(auth.status).json({ success: false, message: auth.message });
  try {
    const outcome = await importProperty(req.body || {});
    res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.error('[map-import]', err.message);
    res.status(500).json({ success: false, message: 'تعذر الاستيراد' });
  }
});

module.exports = router;
