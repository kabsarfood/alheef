const { maskEmail } = require('../utils/email');

function getSiteUrl() {
  return (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://www.alheef.website').replace(/\/$/, '');
}

async function sendViaResend({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'noreply@alheef.website';
  if (!key) return false;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.warn('[email] فشل الإرسال:', res.status, err.slice(0, 80));
    return false;
  }
  return true;
}

async function sendPasswordResetEmail(email, resetUrl) {
  const subject = 'إعادة تعيين كلمة المرور — مكتب الهيف';
  const html = `
    <div dir="rtl" style="font-family:Cairo,sans-serif;line-height:1.7;color:#1E2A38">
      <h2>مكتب الهيف للخدمات العقارية</h2>
      <p>تلقّينا طلب إعادة تعيين كلمة المرور لحساب مسوق الهيف.</p>
      <p><a href="${resetUrl}" style="background:#1E2A38;color:#fff;padding:12px 20px;text-decoration:none;border-radius:8px;display:inline-block">تعيين كلمة مرور جديدة</a></p>
      <p>الرابط صالح لمدة 15 دقيقة. إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>
    </div>
  `;

  const sent = await sendViaResend({ to: email, subject, html });
  if (sent) {
    console.log('[email] أُرسل رابط استعادة إلى', maskEmail(email));
  } else if (process.env.NODE_ENV !== 'production') {
    console.log('[email] مزوّد البريد غير مهيأ — لم يُرسل بريد إلى', maskEmail(email));
  }
  return sent;
}

function buildResetUrl(token) {
  return `${getSiteUrl()}/marketer/reset-password.html?token=${encodeURIComponent(token)}`;
}

module.exports = {
  sendPasswordResetEmail,
  buildResetUrl,
  getSiteUrl,
};
