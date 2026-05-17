document.addEventListener('DOMContentLoaded', () => {
  initLayout('settings', 'الإعدادات');
  getPageContent().innerHTML = `
    <div class="card">
      <div class="card__header"><h2 class="card__title">إعدادات المكتب</h2></div>
      <div class="card__body">
        <p style="color:#8a8580;margin-bottom:1.5rem;line-height:1.8">
          الإعدادات الحالية تُدار عبر ملف <code style="background:#f7f6f4;padding:2px 6px;border-radius:4px">.env</code>
          في جذر المشروع. قريباً: واجهة إعدادات كاملة مع تسجيل الدخول وربط Supabase.
        </p>
        <div class="form-grid form-grid--1">
          <div class="form-group">
            <label>رقم واتساب (بدون +)</label>
            <input type="text" value="966500000000" disabled dir="ltr">
            <span class="form-hint">WHATSAPP_NUMBER في .env</span>
          </div>
          <div class="form-group">
            <label>رقم العرض</label>
            <input type="text" value="050 000 0000" disabled>
            <span class="form-hint">PHONE_DISPLAY في .env</span>
          </div>
        </div>
        <div style="margin-top:2rem;padding:1.25rem;background:#f7f6f4;border-radius:8px">
          <strong style="display:block;margin-bottom:0.5rem">قريباً</strong>
          <ul style="color:#8a8580;font-size:0.9rem;line-height:2;padding-right:1.25rem">
            <li>تسجيل دخول آمن</li>
            <li>ربط Supabase</li>
            <li>إشعارات واتساب التلقائية</li>
            <li>إدارة الفريق والصلاحيات</li>
          </ul>
        </div>
      </div>
    </div>
  `;
});
