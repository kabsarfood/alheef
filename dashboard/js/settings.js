
document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('settings', 'إعدادات الموقع');
  renderForm();
  await loadSettings();
});

function renderForm() {
  getPageContent().innerHTML = `
    <form id="settings-form">
      <div class="settings-grid">
        <section class="card">
          <div class="card__header"><h2 class="card__title">الهوية</h2></div>
          <div class="card__body form-grid form-grid--1">
            <div class="form-group"><label>اسم الموقع</label><input name="siteName" id="siteName" required></div>
            <div class="form-group"><label>وصف الموقع</label><textarea name="siteDescription" id="siteDescription" rows="2"></textarea></div>
            <div class="form-group"><label>الشعار</label><div id="logo-preview" class="settings-preview"></div><input type="file" name="logo" accept="image/*"></div>
            <div class="form-group"><label>Favicon</label><input type="file" name="favicon" accept="image/*"></div>
          </div>
        </section>
        <section class="card">
          <div class="card__header"><h2 class="card__title">Hero</h2></div>
          <div class="card__body form-grid form-grid--1">
            <div class="form-group"><label>عنوان Hero</label><input name="heroTitle" id="heroTitle"></div>
            <div class="form-group"><label>عنوان فرعي</label><input name="heroSubtitle" id="heroSubtitle"></div>
            <div class="form-group"><label>صورة كمبيوتر</label><div id="hero-preview" class="settings-preview settings-preview--wide"></div><input type="file" name="heroImage" accept="image/*"></div>
            <div class="form-group"><label>صورة جوال</label><input type="file" name="heroMobileImage" accept="image/*"></div>
          </div>
        </section>
        <section class="card">
          <div class="card__header"><h2 class="card__title">التواصل</h2></div>
          <div class="card__body form-grid">
            <div class="form-group"><label>واتساب</label><input name="whatsappNumber" id="whatsappNumber" dir="ltr"></div>
            <div class="form-group"><label>جوال</label><input name="phone" id="phone"></div>
            <div class="form-group"><label>بريد</label><input name="email" id="email" dir="ltr"></div>
            <div class="form-group full"><label>عنوان</label><input name="address" id="address"></div>
            <div class="form-group full"><label>Google Map</label><input name="googleMap" id="googleMap" dir="ltr"></div>
            <div class="form-group"><label>انستغرام</label><input name="instagram" id="instagram" dir="ltr"></div>
            <div class="form-group"><label>X</label><input name="twitter" id="twitter" dir="ltr"></div>
            <div class="form-group"><label>سناب</label><input name="snapchat" id="snapchat" dir="ltr"></div>
            <div class="form-group"><label>تيك توك</label><input name="tiktok" id="tiktok" dir="ltr"></div>
          </div>
        </section>
        <section class="card">
          <div class="card__header"><h2 class="card__title">ألوان</h2></div>
          <div class="card__body form-grid">
            <div class="form-group"><label>أساسي</label><input type="color" name="primaryColor" id="primaryColor"></div>
            <div class="form-group"><label>ثانوي</label><input type="color" name="secondaryColor" id="secondaryColor"></div>
          </div>
        </section>
        <section class="card">
          <div class="card__header"><h2 class="card__title">تعريفي</h2></div>
          <div class="card__body form-grid form-grid--1">
            <div class="form-group"><label>من نحن</label><textarea name="aboutText" id="aboutText" rows="4"></textarea></div>
            <div class="form-group"><label>الرؤية</label><textarea name="visionText" id="visionText" rows="3"></textarea></div>
            <div class="form-group"><label>الرسالة</label><textarea name="missionText" id="missionText" rows="3"></textarea></div>
            <div class="form-group"><label>الفوتر</label><input name="footerText" id="footerText"></div>
          </div>
        </section>
      </div>
      <div class="form-actions" style="margin-top:1.5rem"><button type="submit" class="btn btn-gold" id="save-btn">حفظ الإعدادات</button></div>
    </form>
  `;
  document.getElementById('settings-form').addEventListener('submit', handleSave);
}

async function loadSettings() {
  try {
    const s = await DashboardAPI.getSettings();
    const fields = ['siteName','siteDescription','heroTitle','heroSubtitle','whatsappNumber','phone','email','address','googleMap','instagram','twitter','snapchat','tiktok','primaryColor','secondaryColor','aboutText','visionText','missionText','footerText'];
    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (el && s[id] != null) el.value = s[id];
    });
    if (s.logoUrl) document.getElementById('logo-preview').innerHTML = `<img src="${s.logoUrl}" alt="">`;
    if (s.heroImage) document.getElementById('hero-preview').innerHTML = `<img src="${s.heroImage}" alt="">`;
  } catch {
    showToast('تعذر تحميل الإعدادات', 'error');
  }
}

async function handleSave(e) {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'جاري الحفظ...';
  try {
    await DashboardAPI.saveSettings(new FormData(e.target));
    showToast('تم حفظ الإعدادات');
    await loadSettings();
  } catch (err) {
    showToast(err.message || 'فشل الحفظ', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'حفظ الإعدادات';
  }
}
