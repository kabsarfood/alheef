const crypto = require('crypto');
const gate = require('./mapApproval');
const { getAdmin } = require('../lib/supabase');
const { normalizeListingPhone } = require('../utils/phone');
const { createRateLimiter } = require('../utils/rateLimit');

const CODE_BYTES = 32;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGES = 6;
const TYPES = new Set(['أرض', 'فيلا', 'شقة', 'عمارة']);
const CODE_RE = /^[A-Za-z0-9_-]{43}$/;

const limiter = createRateLimiter({ max: 20, windowMs: 10 * 60 * 1000 });

function publicBase() {
  return String(process.env.ALHEEF_PUBLIC_BASE_URL || process.env.SITE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function plain(value, max) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/\son\w+\s*=/gi, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

function allow(req, codeHash) {
  const ipOk = limiter.allow(`ip:${limiter.clientKey(req)}`);
  const linkOk = limiter.allow(`link:${String(codeHash || 'none').slice(0, 16)}`);
  return ipOk && linkOk;
}

function logLink(linkId, result) {
  console.info(JSON.stringify({
    scope: 'map-submit-link',
    at: new Date().toISOString(),
    linkId: linkId || null,
    result,
  }));
}

async function createSubmitLink() {
  const code = crypto.randomBytes(CODE_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const { data, error } = await getAdmin().from('map_submit_links').insert({
    code_hash: hashCode(code),
    status: 'new',
    expires_at: expiresAt,
  }).select('id,status,created_at,expires_at').single();
  if (error) throw new Error(error.message);
  await gateAudit(data.id, 'submit_link_created');
  logLink(data.id, 'created');
  return {
    status: 201,
    body: {
      success: true,
      id: data.id,
      url: `${publicBase()}/map-submit/${code}`,
      status: 'new',
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    },
  };
}

async function gateAudit(linkId, event) {
  try {
    await getAdmin().from('map_publish_audit').insert({
      request_id: null,
      request_number: null,
      event,
      detail: { link_id: linkId },
    });
  } catch {
    // سجل التدقيق لا يكشف الرمز، وفشله لا يعطل إنشاء الرابط.
  }
}

function viewOf(row, requestNumber) {
  const expired = row.status === 'new' && new Date(row.expires_at).getTime() <= Date.now();
  return {
    id: row.id,
    status: expired ? 'expired' : row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    cancelledAt: row.cancelled_at,
    requestNumber: requestNumber || null,
  };
}

async function listSubmitLinks() {
  const { data, error } = await getAdmin()
    .from('map_submit_links')
    .select('id,status,created_at,expires_at,used_at,cancelled_at,request_id')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const ids = (data || []).map((row) => row.request_id).filter(Boolean);
  const numbers = new Map();
  if (ids.length) {
    const found = await getAdmin().from('map_publish_requests').select('id,request_number').in('id', ids);
    (found.data || []).forEach((row) => numbers.set(row.id, row.request_number));
  }
  const stale = (data || []).filter((row) => row.status === 'new' && new Date(row.expires_at).getTime() <= Date.now());
  if (stale.length) {
    await getAdmin().from('map_submit_links').update({ status: 'expired' }).in('id', stale.map((row) => row.id)).eq('status', 'new');
  }
  return { status: 200, body: { success: true, items: (data || []).map((row) => viewOf(row, numbers.get(row.request_id))) } };
}

async function cancelSubmitLink(id) {
  const now = new Date().toISOString();
  const { data, error } = await getAdmin()
    .from('map_submit_links')
    .update({ status: 'cancelled', cancelled_at: now })
    .eq('id', String(id || ''))
    .eq('status', 'new')
    .gt('expires_at', now)
    .select('id,status,created_at,expires_at,used_at,cancelled_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { status: 409, body: { success: false, message: 'لا يمكن إلغاء الرابط في هذه الحالة' } };
  await gateAudit(data.id, 'submit_link_cancelled');
  logLink(data.id, 'cancelled');
  return { status: 200, body: { success: true, item: viewOf(data) } };
}

async function loadLink(code) {
  if (!CODE_RE.test(String(code || ''))) return { state: 'missing' };
  const { data, error } = await getAdmin()
    .from('map_submit_links')
    .select('id,status,expires_at,request_id,code_hash')
    .eq('code_hash', hashCode(code))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { state: 'missing' };
  if (data.status === 'cancelled') return { state: 'cancelled', row: data };
  if (data.status === 'used') return { state: 'used', row: data };
  if (data.status !== 'new' || new Date(data.expires_at).getTime() <= Date.now()) {
    await getAdmin().from('map_submit_links').update({ status: 'expired' }).eq('id', data.id).eq('status', 'new');
    return { state: 'expired', row: data };
  }
  return { state: 'new', row: data };
}

function messageFor(state) {
  if (state === 'used') return 'تم استخدام هذا الرابط.';
  if (state === 'expired') return 'انتهت صلاحية الرابط.';
  if (state === 'cancelled') return 'تم إلغاء الرابط.';
  return 'الرابط غير صالح.';
}

function pageHtml(state) {
  if (state !== 'new') {
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>رابط الإضافة</title></head><body style="font-family:sans-serif;padding:1.5rem;line-height:1.8"><p>${messageFor(state)}</p></body></html>`;
  }
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>إرسال إعلان للموافقة</title></head><body style="font-family:sans-serif;padding:1rem;line-height:1.7;max-width:40rem;margin:auto">
<h1 style="font-size:1.3rem">إرسال إعلان إلى خريطة الهيف</h1>
<p>يُرسل الطلب للموافقة فقط، ولا يُنشر مباشرة.</p>
<form id="submit-form">
<label>نوع العقار<br><select name="property_type" required><option value="أرض">أرض</option><option value="فيلا">فيلا</option><option value="شقة">شقة</option><option value="عمارة">عمارة</option></select></label><br><br>
<label>تفاصيل الإعلان<br><textarea name="details" required rows="8" maxlength="8000"></textarea></label><br><br>
<label>رابط الموقع<br><input name="location_url" inputmode="url"></label><br><br>
<label>رقم التواصل<br><input name="contact_phone" inputmode="tel" autocomplete="tel" maxlength="32"></label>
<p id="phone-error" style="color:#8a1f1f;min-height:1.2em"></p>
<label>رابط المصدر الخارجي، اختياري<br><input name="source_url" inputmode="url"></label><br><br>
<label>اسم المصدر، اختياري<br><input name="source_name" maxlength="120"></label><br><br>
<label>الصور، حتى 6<br><input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><br><br>
<button type="submit">إرسال للموافقة</button>
</form>
<div id="submit-result"></div>
<script>
(function () {
  var form = document.getElementById('submit-form');
  var phoneInput = form.contact_phone;
  var phoneError = document.getElementById('phone-error');
  function digitsOf(value) { return String(value || '').replace(/\\D/g, ''); }
  function accountPhone(digits) {
    var d = digits;
    if (d.indexOf('00966') === 0) d = d.slice(5);
    else if (d.indexOf('966') === 0) d = d.slice(3);
    if (d.charAt(0) === '0') d = d.slice(1);
    if (d.length === 9 && d.charAt(0) === '5') return '0' + d;
    return '';
  }
  function normalizePhone(value) {
    var digits = digitsOf(value);
    var direct = accountPhone(digits);
    if (direct) return direct;
    var sizes = [9, 10, 12, 14];
    for (var i = 0; i < sizes.length; i += 1) {
      var size = sizes[i];
      if (digits.length < size * 2 || digits.length % size !== 0) continue;
      var piece = digits.slice(0, size);
      if (piece.repeat(digits.length / size) !== digits) continue;
      var phone = accountPhone(piece);
      if (phone) return phone;
    }
    return '';
  }
  function syncPhone(event) {
    var phone = normalizePhone(phoneInput.value);
    if (phone) {
      if (phoneInput.value !== phone) phoneInput.value = phone;
      phoneError.textContent = '';
      return phone;
    }
    var show = event && (event.type === 'paste' || event.type === 'change' || event.type === 'submit');
    if (!show && digitsOf(phoneInput.value).length >= 10) show = true;
    phoneError.textContent = show && String(phoneInput.value || '').trim() ? 'رقم الجوال غير صالح' : '';
    return '';
  }
  phoneInput.addEventListener('input', syncPhone);
  phoneInput.addEventListener('change', syncPhone);
  phoneInput.addEventListener('paste', function (event) {
    event.preventDefault();
    var text = event.clipboardData ? event.clipboardData.getData('text') : '';
    phoneInput.value = text;
    syncPhone(event);
  });
  function readImage(file, signal) {
    return new Promise(function (resolve, reject) {
      var aborted = false;
      function abortRead() {
        aborted = true;
        reject(Object.assign(new Error('abort'), { name: 'AbortError' }));
      }
      if (signal.aborted) { abortRead(); return; }
      var reader = new FileReader();
      function stop() { reader.abort(); abortRead(); }
      signal.addEventListener('abort', stop, { once: true });
      reader.onload = function () {
        signal.removeEventListener('abort', stop);
        resolve(reader.result);
      };
      reader.onerror = function () {
        signal.removeEventListener('abort', stop);
        if (!aborted) reject(new Error('image'));
      };
      reader.readAsDataURL(file);
    });
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var button = form.querySelector('button');
    var result = document.getElementById('submit-result');
    var phone = syncPhone({ type: 'submit' });
    if (String(phoneInput.value || '').trim() && !phone) {
      result.textContent = 'رقم الجوال غير صالح';
      return;
    }
    var files = form.images.files;
    if (files.length > 6) { result.textContent = 'الحد الأقصى 6 صور.'; return; }
    button.disabled = true;
    result.textContent = 'جارٍ الإرسال…';
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 45000);
    try {
      var images = [];
      for (var i = 0; i < files.length; i += 1) images.push(await readImage(files[i], controller.signal));
      var code = location.pathname.split('/').filter(Boolean).pop();
      var response = await fetch('/api/integrations/alheef-map/one-time-submit/' + encodeURIComponent(code), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_type: form.property_type.value,
          details: form.details.value,
          location_url: form.location_url.value,
          contact_phone: phone,
          source_url: form.source_url.value,
          source_name: form.source_name.value,
          images: images
        }),
        signal: controller.signal
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.success) {
        button.disabled = false;
        result.textContent = data.message || 'تعذر إرسال الإعلان.';
        return;
      }
      form.remove();
      var title = document.createElement('p');
      var number = document.createElement('p');
      var state = document.createElement('p');
      if (data.status === 'pending_approval' && !data.idempotent) {
        title.textContent = 'تم إرسال الإعلان للموافقة';
        number.textContent = 'رقم الطلب: ' + String(data.request_number || '');
        state.textContent = 'الحالة: بانتظار الموافقة';
      } else {
        title.textContent = data.message || 'تم استخدام هذا الرابط.';
      }
      result.replaceChildren(title, number, state);
    } catch (error) {
      button.disabled = false;
      result.textContent = error && error.name === 'AbortError'
        ? 'انتهت مهلة الإرسال. حاول مرة أخرى.'
        : 'تعذر الاتصال. حاول مرة أخرى.';
    } finally {
      clearTimeout(timer);
    }
  });
})();
</script>
</body></html>`;
}

async function pageForCode(code) {
  const loaded = await loadLink(code);
  if (loaded.state === 'missing') return { status: 404, html: pageHtml('missing') };
  return { status: 200, html: pageHtml(loaded.state) };
}

function validate(body) {
  const propertyType = plain(body?.property_type, 40);
  const details = plain(body?.details, 8000);
  const sourceName = plain(body?.source_name, 120);
  const sourceUrl = String(body?.source_url || '').trim();
  const locationUrl = String(body?.location_url || '').trim();
  const rawPhone = String(body?.contact_phone || '').trim();
  const phone = normalizeListingPhone(rawPhone);
  if (!TYPES.has(propertyType)) {
    const error = new Error('نوع العقار غير مدعوم');
    error.status = 400;
    throw error;
  }
  if (!details) {
    const error = new Error('تفاصيل الإعلان مطلوبة');
    error.status = 400;
    throw error;
  }
  if (rawPhone && !phone) {
    const error = new Error('رقم الجوال غير صالح');
    error.status = 400;
    throw error;
  }
  if (body?.images != null && !Array.isArray(body.images)) {
    const error = new Error('حقل الصور يجب أن يكون قائمة');
    error.status = 400;
    throw error;
  }
  if ((body?.images || []).length > MAX_IMAGES) {
    const error = new Error('عدد الصور يتجاوز الحد');
    error.status = 400;
    throw error;
  }
  return {
    property_type: propertyType,
    details,
    location_url: locationUrl,
    contact_phone: phone,
    source_type: 'chatgpt',
    source_name: sourceName || 'ChatGPT',
    source_url: sourceUrl,
    images: body?.images || [],
  };
}

async function existingRequest(link) {
  if (!link?.request_id) return null;
  const { data } = await getAdmin().from('map_publish_requests').select('request_number,status').eq('id', link.request_id).maybeSingle();
  return data;
}

function publicResult(row) {
  return {
    success: true,
    request_number: row.request_number,
    status: row.status,
    message: row.status === 'pending_approval' ? 'تم إرسال الإعلان للموافقة.' : 'تم استلام الطلب من غير نشر إعلان جديد.',
  };
}

async function submitOnce(code, body) {
  const loaded = await loadLink(code);
  if (loaded.state === 'missing') return { status: 404, body: { success: false, message: messageFor('missing') } };
  if (loaded.state !== 'new') {
    const current = await existingRequest(loaded.row);
    if (loaded.state === 'used' && current) {
      return { status: 200, body: { ...publicResult(current), idempotent: true, message: 'تم استخدام هذا الرابط.' } };
    }
    return { status: 409, body: { success: false, message: messageFor(loaded.state) } };
  }
  let payload;
  try {
    payload = validate(body);
  } catch (error) {
    return { status: error.status || 400, body: { success: false, message: gate.safeReason(error) } };
  }
  payload.idempotency_key = `map-submit:${loaded.row.code_hash}`;
  const now = new Date().toISOString();
  const claimed = await getAdmin()
    .from('map_submit_links')
    .update({ status: 'used', used_at: now })
    .eq('id', loaded.row.id)
    .eq('status', 'new')
    .gt('expires_at', now)
    .select('id')
    .maybeSingle();
  if (claimed.error) return { status: 500, body: { success: false, message: 'تعذر إرسال الإعلان' } };
  if (!claimed.data) return { status: 409, body: { success: false, message: 'تم استخدام هذا الرابط.' } };
  try {
    const outcome = await gate.createRequest(payload);
    const requestId = outcome.body?.request_id || null;
    if (requestId) {
      await getAdmin().from('map_submit_links').update({ request_id: requestId }).eq('id', loaded.row.id);
    }
    await gateAudit(loaded.row.id, 'submit_link_used');
    logLink(loaded.row.id, 'used');
    const result = publicResult(outcome.body || {});
    if (outcome.body?.duplicate) result.message = 'هذا الإعلان موجود مسبقًا، ولم يُنشر إعلان جديد.';
    return { status: outcome.status, body: result };
  } catch (error) {
    await getAdmin().from('map_submit_links').update({ status: 'new', used_at: null }).eq('id', loaded.row.id).is('request_id', null);
    const status = error.status || 500;
    return { status, body: { success: false, message: status === 500 ? 'تعذر إرسال الإعلان' : gate.safeReason(error) } };
  }
}

module.exports = {
  allow,
  createSubmitLink,
  listSubmitLinks,
  cancelSubmitLink,
  pageForCode,
  renderSubmitForm: () => pageHtml('new'),
  submitOnce,
  hashCode,
};
