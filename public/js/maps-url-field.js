/**
 * حقل رابط Google Maps — مشترك بين إنشاء وتعديل الإعلانات
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
    if (window.AlheefCoords?.normalizeMapsUrl) return AlheefCoords.normalizeMapsUrl(raw);
    return String(raw || '').trim();
  }

  function looksLike(url) {
    if (window.AlheefCoords?.looksLikeMapsUrl) return AlheefCoords.looksLikeMapsUrl(url);
    const text = stripUrl(url);
    return /^https?:\/\//i.test(text)
      && /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google/i.test(text);
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
    return `الصيغ المقبولة: <span dir="ltr">maps.app.goo.gl</span> · <span dir="ltr">google.com/maps</span> · <span dir="ltr">goo.gl/maps</span> — من Google Maps: <strong>مشاركة</strong> ← <strong>نسخ الرابط</strong> ← الصق هنا — يظهر على ${mapLink}`;
  }

  function updateHint(state) {
    const hint = document.getElementById(cfg.hintId);
    if (!hint) return;
    const base = baseHintHtml();

    if (state === 'loading') {
      hint.innerHTML = `${base}<br><span style="color:var(--text-secondary)">جاري التحقق من الرابط…</span>`;
      return;
    }

    if (getCoords()) {
      hint.innerHTML = `${base} — <strong style="color:var(--gold,#b8860b)">تم التعرف على الموقع ✓</strong>`;
      return;
    }

    const url = getValue();
    if (!url) {
      hint.innerHTML = base;
      return;
    }

    if (state === 'not-url' || !looksLike(url)) {
      hint.innerHTML = `${base}<br><span style="color:var(--danger,#c0392b)">الصق <strong>رابط Google Maps</strong> من «مشاركة» — وليس نص العنوان فقط</span>`;
      return;
    }

    hint.innerHTML = `${base}<br><span style="color:var(--danger,#c0392b)">تعذر قراءة الرابط — جرّب نسخ الرابط من «مشاركة» مرة أخرى</span>`;
  }

  function scheduleResolve() {
    clearTimeout(_timer);
    _timer = setTimeout(() => resolve(), 450);
  }

  async function resolve() {
    const input = getInput();
    if (!input) return null;

    const normalized = getValue();
    if (normalized && normalized !== input.value.trim()) {
      input.value = normalized;
    }

    if (!normalized) {
      setCoords(null);
      updateHint();
      return null;
    }

    const local = window.AlheefCoords
      ? AlheefCoords.normalize(AlheefCoords.parseFromMapsUrl(normalized))
      : null;
    if (local) {
      setCoords(local, normalized);
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
      const res = await fetch(cfg.parseEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...cfg.authHeaders(),
        },
        body: JSON.stringify({ url: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('انتهت الجلسة');
      if (data.success && data.lat != null && data.lng != null) {
        if (data.resolvedUrl) input.value = data.resolvedUrl;
        const resolved = setCoords({ lat: data.lat, lng: data.lng }, getValue());
        updateHint('ok');
        return resolved;
      }
    } catch {
      /* fall through */
    }

    setCoords(null);
    updateHint('fail');
    return null;
  }

  function bind() {
    const input = getInput();
    if (!input) return;
    input.addEventListener('input', () => {
      setCoords(null);
      scheduleResolve();
    });
    input.addEventListener('paste', () => setTimeout(scheduleResolve, 0));
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

    const coords = getCoords();
    if (coords) {
      fd.set('latitude', coords.lat);
      fd.set('longitude', coords.lng);
    } else {
      fd.delete('latitude');
      fd.delete('longitude');
    }

    if (validate) {
      if (!mapsUrl) {
        return { ok: false, message: 'رابط Google Maps مطلوب لنشر الإعلان على الخريطة' };
      }
      if (!looksLike(mapsUrl)) {
        return { ok: false, message: 'الصق رابط «مشاركة» من Google Maps — وليس نص العنوان فقط' };
      }
    }

    return { ok: true, coords, mapsUrl };
  }

  function fieldHtml(options = {}) {
    const required = options.required !== false;
    const label = options.label || 'رابط اللوكيشن (Google Maps)';
    const reqMark = required ? ' <span class="required">*</span>' : '';
    const reqAttr = required ? ' required' : '';
    return `
      <div class="form-group full">
        <label for="${cfg.inputId}">${label}${reqMark}</label>
        <input type="text" name="mapsUrl" id="${cfg.inputId}" placeholder="https://maps.app.goo.gl/... أو https://www.google.com/maps/place/..." dir="ltr" inputmode="url" autocomplete="off"${reqAttr}>
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
