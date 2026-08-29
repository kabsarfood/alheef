/**
 * حقل رابط مشاركة Google Maps — الموقع يُستخرج على الخادم من الرابط
 */
const MapsUrlField = (() => {
  let cfg = {
    inputId: 'mapsUrl',
    hintId: 'maps-url-hint',
    parseEndpoint: '/api/map/parse-coords',
    authHeaders: () => ({}),
    mapPageUrl: '/map.html',
  };

  let _coords = null;
  let _coordsForUrl = '';
  let _timer = null;

  function configure(options = {}) {
    cfg = { ...cfg, ...options };
  }

  function stripUrl(raw) {
    if (window.AlheefCoords?.extractMapsUrl) return AlheefCoords.extractMapsUrl(raw);
    if (window.AlheefCoords?.normalizeMapsUrl) return AlheefCoords.normalizeMapsUrl(raw);
    return String(raw || '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim();
  }

  function looksLike(url) {
    const raw = String(url || '');
    if (/maps\.app\.goo\.gl|goo\.gl\/maps|share\.google|google\.[a-z.]+\/maps|maps\.google|goo\.gle|g\.co\//i.test(raw)) {
      return true;
    }
    if (window.AlheefCoords?.looksLikeMapsUrl) return AlheefCoords.looksLikeMapsUrl(url);
    return false;
  }

  function getInput() {
    return document.getElementById(cfg.inputId);
  }

  function getValue() {
    return stripUrl(getInput()?.value || '');
  }

  function setRequired(required) {
    const el = getInput();
    if (el) el.required = !!required;
  }

  function setCoords(coords, url) {
    if (coords && window.AlheefCoords?.isValidCoord(coords.lat, coords.lng)) {
      _coords = { lat: Number(coords.lat), lng: Number(coords.lng) };
      _coordsForUrl = url || getValue();
      return _coords;
    }
    _coords = null;
    _coordsForUrl = '';
    return null;
  }

  function getCoords() {
    const mapsUrl = getValue();
    if (_coords && _coordsForUrl && _coordsForUrl === mapsUrl) return _coords;
    if (window.AlheefCoords && mapsUrl) {
      return AlheefCoords.normalize(AlheefCoords.parseFromMapsUrl(mapsUrl));
    }
    return null;
  }

  function baseHintHtml() {
    const mapLink = cfg.mapPageUrl
      ? `<a href="${cfg.mapPageUrl}" target="_blank" rel="noopener">الخريطة العقارية</a>`
      : 'الخريطة';
    return `الصق <strong>رابط المشاركة</strong> من Google Maps (مشاركة ← نسخ الرابط) مثل <span dir="ltr">https://maps.app.goo.gl/...</span> — يظهر بنقطة نابضة على ${mapLink}`;
  }

  function updateHint(state) {
    const hint = document.getElementById(cfg.hintId);
    if (!hint) return;
    const base = baseHintHtml();
    const coords = getCoords();
    const url = getValue();

    if (state === 'loading') {
      hint.innerHTML = `${base}<br><span style="color:var(--text-secondary)">جاري تحديد الموقع من رابط المشاركة…</span>`;
      return;
    }

    if (coords) {
      hint.innerHTML = `${base}<br><strong style="color:var(--gold,#b8860b)">تم التعرف على الموقع ✓</strong>`;
      return;
    }

    if (!url) {
      hint.innerHTML = base;
      return;
    }

    if (looksLike(url)) {
      hint.innerHTML = `${base}<br><strong style="color:var(--gold,#b8860b)">رابط مشاركة صحيح — يُحدد الموقع تلقائياً عند الحفظ</strong>`;
      return;
    }

    hint.innerHTML = `${base}<br><span style="color:var(--danger,#c0392b)">الصق رابط المشاركة من Google Maps، وليس اسم الحي أو العنوان</span>`;
  }

  function scheduleResolve() {
    clearTimeout(_timer);
    _timer = setTimeout(() => resolve(), 200);
  }

  async function resolveFromServer(url) {
    const res = await fetch(cfg.parseEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...cfg.authHeaders(),
      },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.success && data.lat != null && data.lng != null) return data;
    return null;
  }

  async function resolve() {
    const input = getInput();
    if (!input) return null;

    const normalized = getValue();
    if (normalized && normalized !== input.value.trim()) input.value = normalized;

    if (!normalized) {
      setCoords(null);
      updateHint();
      return null;
    }

    const local = window.AlheefCoords
      ? AlheefCoords.normalize(AlheefCoords.parseFromMapsUrl(normalized))
      : null;
    if (local) {
      setCoords(local, getValue());
      updateHint('ok');
      return local;
    }

    if (!looksLike(normalized)) {
      setCoords(null);
      updateHint('not-url');
      return null;
    }

    updateHint('loading');

    try {
      const data = await resolveFromServer(normalized);
      if (data) {
        const kept = window.AlheefCoords?.preferStoredMapsUrl
          ? AlheefCoords.preferStoredMapsUrl(normalized, data.resolvedUrl)
          : normalized;
        if (kept && kept !== input.value) input.value = kept;
        const resolved = setCoords({ lat: data.lat, lng: data.lng }, getValue());
        updateHint('ok');
        return resolved;
      }
    } catch {
      /* الموقع يُستخرج عند الحفظ على الخادم */
    }

    setCoords(null);
    updateHint('pending');
    return null;
  }

  function bind() {
    const input = getInput();
    if (!input) return;

    input.addEventListener('paste', (e) => {
      const clip = e.clipboardData?.getData('text') || e.clipboardData?.getData('text/plain') || '';
      const extracted = stripUrl(clip);
      if (!extracted || !looksLike(extracted)) return;
      e.preventDefault();
      input.value = extracted;
      setCoords(null);
      resolve();
    });

    input.addEventListener('input', () => {
      setCoords(null);
      scheduleResolve();
    });
    input.addEventListener('change', () => resolve());
  }

  async function loadFromOffer(offer = {}) {
    const input = getInput();
    if (!input) return;
    input.value = offer.mapsUrl || '';
    setCoords(null);
    if (offer.mapsUrl) {
      await resolve();
      return;
    }
    if (
      offer.latitude != null
      && offer.longitude != null
      && window.AlheefCoords?.isValidCoord(offer.latitude, offer.longitude)
    ) {
      setCoords({ lat: offer.latitude, lng: offer.longitude }, '');
      updateHint('ok');
      return;
    }
    updateHint();
  }

  async function applyToFormData(fd, { validate = false } = {}) {
    const mapsUrl = getValue();
    fd.set('mapsUrl', mapsUrl || '');

    if (mapsUrl) await resolve();

    let coords = getCoords();
    if (coords) {
      fd.set('latitude', coords.lat);
      fd.set('longitude', coords.lng);
    } else {
      fd.delete('latitude');
      fd.delete('longitude');
    }

    if (validate && !mapsUrl) {
      return { ok: false, message: 'الصق رابط مشاركة Google Maps لنشر الإعلان على الخريطة' };
    }

    if (validate && mapsUrl && !looksLike(mapsUrl) && !coords) {
      return {
        ok: false,
        message: 'الصق رابط «مشاركة» من Google Maps وليس اسم الحي أو العنوان',
      };
    }

    return { ok: true, coords, mapsUrl: fd.get('mapsUrl') };
  }

  function fieldHtml(options = {}) {
    const required = options.required !== false;
    const label = options.label || 'رابط الموقع من Google Maps';
    const reqMark = required ? ' <span class="required">*</span>' : '';
    const reqAttr = required ? ' required' : '';
    return `
      <div class="form-group full">
        <label for="${cfg.inputId}">${label}${reqMark}</label>
        <input type="text" name="mapsUrl" id="${cfg.inputId}" placeholder="الصق رابط المشاركة — https://maps.app.goo.gl/..." dir="ltr" inputmode="url" autocomplete="off"${reqAttr}>
        <span class="form-hint" id="${cfg.hintId}">${baseHintHtml()}</span>
      </div>
    `;
  }

  return {
    configure,
    bind,
    resolve,
    getValue,
    getCoords,
    looksLike,
    setRequired,
    updateHint,
    loadFromOffer,
    applyToFormData,
    fieldHtml,
  };
})();
