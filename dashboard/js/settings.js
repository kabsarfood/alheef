let currentSettings = null;
let logoFile = null;
let heroFile = null;

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
          <div class="card__body">
            <div class="form-grid form-grid--1">
              <div class="form-group">
                <label>اسم الموقع</label>
                <input type="text" id="siteName" name="siteName" required>
              </div>
              <div class="form-group">
                <label>الوصف القصير</label>
                <input type="text" id="siteTagline" name="siteTagline">
              </div>
              <div class="form-group">
                <label>الشعار</label>
                <div class="settings-preview" id="logo-preview"></div>
                <label class="image-upload" style="margin-top:0.75rem;display:block">
                  <input type="file" id="logo" accept="image/*">
                  <p class="image-upload__text">رفع شعار جديد</p>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card__header"><h2 class="card__title">الصفحة الرئيسية</h2></div>
          <div class="card__body">
            <div class="form-grid form-grid--1">
              <div class="form-group">
                <label>صورة البنر</label>
                <div class="settings-preview settings-preview--wide" id="hero-preview"></div>
                <label class="image-upload" style="margin-top:0.75rem;display:block">
                  <input type="file" id="heroImage" accept="image/*">
                  <p class="image-upload__text">رفع صورة البنر</p>
                </label>
              </div>
              <div class="form-group">
                <label>العنوان الفرعي</label>
                <input type="text" id="heroLabel" name="heroLabel">
              </div>
              <div class="form-group">
                <label>العنوان الرئيسي</label>
                <input type="text" id="heroTitle" name="heroTitle">
              </div>
              <div class="form-group">
                <label>الوصف</label>
                <textarea id="heroDescription" name="heroDescription" rows="3"></textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>زر العروض</label>
                  <input type="text" id="heroBtnOffers" name="heroBtnOffers">
                </div>
                <div class="form-group">
                  <label>زر الطلب</label>
                  <input type="text" id="heroBtnRequest" name="heroBtnRequest">
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card__header"><h2 class="card__title">الألوان</h2></div>
          <div class="card__body">
            <div class="form-grid">
              <div class="form-group">
                <label>اللون الأساسي (كحلي)</label>
                <input type="color" id="colorPrimary" name="colorPrimary">
              </div>
              <div class="form-group">
                <label>الذهبي</label>
                <input type="color" id="colorGold" name="colorGold">
              </div>
              <div class="form-group">
                <label>النص الرئيسي</label>
                <input type="color" id="colorTextPrimary" name="colorTextPrimary">
              </div>
              <div class="form-group">
                <label>النص الثانوي</label>
                <input type="color" id="colorTextSecondary" name="colorTextSecondary">
              </div>
              <div class="form-group">
                <label>لون الأزرار</label>
                <input type="color" id="colorButtonPrimary" name="colorButtonPrimary">
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card__header"><h2 class="card__title">التواصل</h2></div>
          <div class="card__body">
            <div class="form-grid">
              <div class="form-group">
                <label>رقم الجوال (عرض)</label>
                <input type="text" id="contactPhone" name="contactPhone">
              </div>
              <div class="form-group">
                <label>واتساب (بدون +)</label>
                <input type="text" id="contactWhatsapp" name="contactWhatsapp" dir="ltr">
              </div>
              <div class="form-group">
                <label>البريد الإلكتروني</label>
                <input type="email" id="contactEmail" name="contactEmail" dir="ltr">
              </div>
              <div class="form-group full">
                <label>الموقع / العنوان</label>
                <input type="text" id="contactLocation" name="contactLocation">
              </div>
              <div class="form-group">
                <label>انستغرام</label>
                <input type="url" id="contactInstagram" name="contactInstagram" dir="ltr">
              </div>
              <div class="form-group">
                <label>X</label>
                <input type="url" id="contactX" name="contactX" dir="ltr">
              </div>
            </div>
          </div>
          </div>
        </section>
      </div>

      <div class="form-actions" style="margin-top:1.5rem">
        <button type="submit" class="btn btn-gold" id="save-btn">حفظ جميع الإعدادات</button>
        <a href="/" target="_blank" class="btn btn-outline">معاينة الموقع</a>
      </div>
    </form>
  `;

  document.getElementById('settings-form').addEventListener('submit', handleSave);
  document.getElementById('logo').addEventListener('change', (e) => {
    logoFile = e.target.files[0] || null;
    if (logoFile) previewFile(logoFile, 'logo-preview');
  });
  document.getElementById('heroImage').addEventListener('change', (e) => {
    heroFile = e.target.files[0] || null;
    if (heroFile) previewFile(heroFile, 'hero-preview');
  });
}

async function loadSettings() {
  try {
    currentSettings = await DashboardAPI.getSettings();
    fillForm(currentSettings);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function fillForm(s) {
  setVal('siteName', s.siteName);
  setVal('siteTagline', s.siteTagline);
  setVal('heroLabel', s.hero?.label);
  setVal('heroTitle', s.hero?.title);
  setVal('heroDescription', s.hero?.description);
  setVal('heroBtnOffers', s.hero?.btnOffers);
  setVal('heroBtnRequest', s.hero?.btnRequest);
  setVal('contactPhone', s.contact?.phone);
  setVal('contactWhatsapp', s.contact?.whatsapp);
  setVal('contactEmail', s.contact?.email);
  setVal('contactLocation', s.contact?.location);
  setVal('contactInstagram', s.contact?.instagram);
  setVal('contactX', s.contact?.x);
  setColor('colorPrimary', s.colors?.primary);
  setColor('colorGold', s.colors?.gold);
  setColor('colorTextPrimary', s.colors?.textPrimary);
  setColor('colorTextSecondary', s.colors?.textSecondary);
  setColor('colorButtonPrimary', s.colors?.buttonPrimary);
  if (s.logo) setPreviewImg('logo-preview', s.logo);
  if (s.heroImage) setPreviewImg('hero-preview', s.heroImage);
}

function setVal(id, v) {
  const el = document.getElementById(id);
  if (el && v != null) el.value = v;
}

function setColor(id, v) {
  const el = document.getElementById(id);
  if (el && v) el.value = v;
}

function setPreviewImg(containerId, src) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<img src="${src}" alt="">`;
}

function previewFile(file, containerId) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<img src="${e.target.result}" alt="">`;
  };
  reader.readAsDataURL(file);
}

async function handleSave(e) {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'جاري الحفظ...';

  const fd = new FormData();
  const fields = [
    'siteName', 'siteTagline', 'heroLabel', 'heroTitle', 'heroDescription',
    'heroBtnOffers', 'heroBtnRequest', 'contactPhone', 'contactWhatsapp',
    'contactEmail', 'contactLocation', 'contactInstagram', 'contactX',
    'colorPrimary', 'colorGold', 'colorTextPrimary', 'colorTextSecondary', 'colorButtonPrimary',
  ];
  fields.forEach((name) => {
    const el = document.getElementById(name);
    if (el) fd.append(name, el.value);
  });
  if (logoFile) fd.append('logo', logoFile);
  if (heroFile) fd.append('heroImage', heroFile);
  if (currentSettings?.logo && !logoFile) fd.append('logoUrl', currentSettings.logo);
  if (currentSettings?.heroImage && !heroFile) fd.append('heroImageUrl', currentSettings.heroImage);

  try {
    const res = await DashboardAPI.saveSettings(fd);
    currentSettings = res.data;
    logoFile = null;
    heroFile = null;
    showToast('تم حفظ الإعدادات بنجاح');
    fillForm(currentSettings);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'حفظ جميع الإعدادات';
  }
}
