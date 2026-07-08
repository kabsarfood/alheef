const { isEnabled } = require('../lib/supabase');

function requireDb(_req, res, next) {
  if (!isEnabled()) {
    return res.status(503).json({
      success: false,
      message: 'الخدمة غير متاحة حالياً — تواصل مع إدارة المكتب',
    });
  }
  next();
}

module.exports = { requireDb };
