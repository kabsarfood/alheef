const multer = require('multer');
const direct = require('../services/mapDirectSubmit');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 6, fileSize: 8 * 1024 * 1024, fields: 12, fieldSize: 64 * 1024 },
});

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[ch]));
}

function sniffedDataUrl(file) {
  const buffer = file?.buffer;
  if (!buffer?.length) return '';
  let mime = '';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) mime = 'image/jpeg';
  else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) mime = 'image/png';
  else if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
  if (!mime) return '';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function pageHtml(token) {
  const key = escapeHtml(token);
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>إرسال إعلان</title></head><body style="font-family:sans-serif;padding:1rem;line-height:1.7;max-width:40rem;margin:auto">
<h1 style="font-size:1.3rem">إرسال إعلان إلى خريطة الهيف</h1>
<p>بدون رمز دخول. الصق الإعلان كما هو، أو انسخه من الموقع، ثم أرسله. يصل إشعار واتساب للموافقة أو الرفض، وبعد الموافقة يظهر في العروض الخاصة وعلى الخريطة.</p>
<form id="map-form" method="post" action="/api/map-submit" enctype="multipart/form-data" novalidate>
<input type="hidden" name="k" value="${key}">
<label>تفاصيل الإعلان<br><textarea name="details" required rows="10" maxlength="8000"></textarea></label><br><br>
<label>رابط خرائط Google<br><input name="maps_url" inputmode="url" placeholder="أو ضعه داخل نص الإعلان"></label><br><br>
<label>رابط صفحة الإعلان، اختياري<br><input name="source_url" inputmode="url" placeholder="https://"></label><br><br>
<label>رقم الجوال، اختياري<br><input name="contact_phone" inputmode="tel" value="0530792754" maxlength="32"></label><br><br>
<label>الصور، حتى 6<br><input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><br><br>
<div style="position:absolute;left:-9999px;height:0;overflow:hidden" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
<button type="submit" id="send-listing">إرسال الإعلان</button>
</form>
<div id="map-result" style="min-height:1.4em;font-weight:700"></div>
<script>
(function () {
  var form = document.getElementById('map-form');
  var result = document.getElementById('map-result');
  var button = document.getElementById('send-listing');
  var fileInput = form.querySelector('input[type=file]');
  function compress(file, signal) {
    return new Promise(function (resolve, reject) {
      if (signal.aborted) { reject(Object.assign(new Error('abort'), { name: 'AbortError' })); return; }
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        var longest = Math.max(image.width, image.height) || 1;
        var scale = Math.min(1, 1600 / longest);
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) reject(new Error('image'));
          else resolve(blob);
        }, 'image/jpeg', 0.82);
      };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
      image.src = url;
    });
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var details = form.details.value.trim();
    var maps = form.maps_url.value.trim();
    if (!details) { result.textContent = 'تفاصيل الإعلان مطلوبة'; return; }
    if (!maps && !/https?:\/\/\S+/.test(details)) { result.textContent = 'أضف رابط خرائط Google داخل الإعلان أو في حقله'; return; }
    var files = fileInput.files || [];
    if (files.length > 6) { result.textContent = 'الحد الأقصى 6 صور.'; return; }
    button.disabled = true;
    button.textContent = 'جارٍ الإرسال…';
    result.textContent = 'جارٍ الإرسال…';
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var signal = controller ? controller.signal : { aborted: false };
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 90000);
    try {
      var body = new FormData();
      body.append('k', form.k.value);
      body.append('details', details);
      body.append('maps_url', maps);
      body.append('source_url', form.source_url.value);
      body.append('contact_phone', form.contact_phone.value);
      body.append('website', form.website.value);
      for (var i = 0; i < files.length; i += 1) {
        body.append('images', await compress(files[i], signal), 'photo-' + i + '.jpg');
      }
      var response = await fetch('/api/map-submit', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: body,
        signal: controller ? controller.signal : undefined
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok) {
        button.disabled = false;
        button.textContent = 'إرسال الإعلان';
        result.textContent = data.message || 'تعذر إرسال الإعلان';
        return;
      }
      form.remove();
      var title = document.createElement('p');
      var number = document.createElement('p');
      title.textContent = 'تم إرسال الإعلان للموافقة';
      number.textContent = 'رقم الطلب: ' + String(data.request_number || '');
      result.replaceChildren(title, number);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'إرسال الإعلان';
      result.textContent = error && error.message === 'image'
        ? 'تعذر قراءة الصور. استخدم JPG أو PNG.'
        : (error && error.name === 'AbortError' ? 'انتهت مهلة الإرسال. أعد المحاولة.' : 'تعذر الاتصال. أعد المحاولة، ولن يُنشأ طلب مكرر.');
    } finally {
      clearTimeout(timer);
    }
  });
})();
</script>
</body></html>`;
}

function send(req, res, status, body) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  const accept = String(req.get('accept') || '');
  const wantsHtml = /text\/html/i.test(accept) && !/application\/json/i.test(accept);
  if (!wantsHtml) return res.status(status).json(body);
  const message = body.ok
    ? `<p>تم إرسال الإعلان للموافقة</p><p>رقم الطلب: ${escapeHtml(body.request_number)}</p>`
    : `<p>${escapeHtml(body.message || 'تعذر إرسال الإعلان')}</p>`;
  return res.status(status).type('html').send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta name="robots" content="noindex,nofollow"></head><body style="font-family:sans-serif;padding:1.5rem">${message}</body></html>`);
}

function tokenFrom(req) {
  return String(req.body?.k || req.query?.k || req.get('x-map-submit-token') || '').trim();
}

async function handle(req, res) {
  if (!direct.allowIp(req)) return send(req, res, 429, { ok: false, message: 'محاولات كثيرة. أعد المحاولة لاحقًا' });
  const token = tokenFrom(req);
  if (token && !direct.tokenMatches(token)) return send(req, res, 404, { ok: false, message: 'الصفحة غير موجودة' });
  if (!direct.allowKey()) return send(req, res, 429, { ok: false, message: 'محاولات كثيرة. أعد المحاولة لاحقًا' });
  const outcome = await direct.submitDirect(req.body || {});
  return send(req, res, outcome.status, outcome.body);
}

function page(req, res) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; connect-src 'self'; form-action 'self'; base-uri 'none'");
  const token = String(req.query.k || '').trim();
  if (token && !direct.tokenMatches(token)) {
    return res.status(404).type('html').send('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta name="robots" content="noindex,nofollow"></head><body><p>الصفحة غير موجودة</p></body></html>');
  }
  return res.status(200).type('html').send(pageHtml(''));
}

function submit(req, res, next) {
  const type = String(req.get('content-type') || '');
  if (!/multipart\/form-data/i.test(type)) return handle(req, res).catch(next);
  return upload.array('images', 6)(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'حجم الصورة يتجاوز الحد' : 'تعذر قراءة الصور';
      return send(req, res, 400, { ok: false, message });
    }
    const images = [];
    for (const file of req.files || []) {
      const dataUrl = sniffedDataUrl(file);
      if (!dataUrl) return send(req, res, 400, { ok: false, message: 'نوع الصورة غير مسموح' });
      images.push(dataUrl);
    }
    req.body = { ...(req.body || {}), images };
    return handle(req, res).catch(next);
  });
}

module.exports = { page, submit };
