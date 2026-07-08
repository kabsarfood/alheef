const { maskEmail } = require('../utils/email');

/**
 * إرسال بريد — يدعم SMTP عند التفعيل (RESEND_API_KEY أو SMTP_*)
 * لا يطبع المحتوى الحساس في السجلات
 */
async function sendPasswordResetEmail({ to, resetUrl }) {
  const masked = maskEmail(to);
  const from = process.env.MAIL_FROM || 'noreply@alheef.website';
  const subject = 'إعادة تعيين كلمة مرور — مكتب الهيف للخدمات العقارية';
  const text = [
    'مرحباً،',
    '',
    'تلقّينا طلباً لإعادة تعيين كلمة مرور حسابك في لوحة مسوقي مكتب الهيف.',
    'الرابط صالح لمدة 15 دقيقة:',
    resetUrl,
    '',
    'إذا لم تطلب ذلك، تجاهل هذه الرسالة.',
    '',
    'مكتب الهيف للخدمات العقارية',
  ].join('\n');

  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[email] فشل Resend لـ', masked, err.slice(0, 80));
      return { ok: false, provider: 'resend' };
    }
    console.log('[email] تم إرسال استعادة كلمة المرور إلى', masked);
    return { ok: true, provider: 'resend' };
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    console.log('[email] SMTP مُعرّف — أضف nodemailer لاحقاً؛ الرابط جاهز لـ', masked);
    return { ok: false, provider: 'smtp_stub', queued: true };
  }

  console.log('[email] مزود البريد غير مفعّل — تم إنشاء رمز الاستعادة لـ', masked);
  return { ok: false, provider: 'none', queued: false };
}

module.exports = { sendPasswordResetEmail };
