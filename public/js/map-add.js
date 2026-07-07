(function () {
  'use strict';

  const TOKEN_KEY = 'alheef_admin_token';
  const LOGIN_URL = '/dashboard/login.html?return=' + encodeURIComponent('/map.html');

  let isAdmin = false;
  let addMode = false;
  let pickMarker = null;
  let pendingLatLng = null;

  const els = {
    panel: document.getElementById('map-add-panel'),
    backdrop: document.getElementById('map-add-backdrop'),
    close: document.getElementById('map-add-close'),
    form: document.getElementById('map-add-form'),
    fab: document.getElementById('map-add-fab'),
    coordsLabel: document.getElementById('map-add-coords-label'),
    lat: document.getElementById('map-add-lat'),
    lng: document.getElementById('map-add-lng'),
    preview: document.getElementById('map-add-preview'),
    images: document.getElementById('map-add-images'),
    submit: document.getElementById('map-add-submit'),
  };

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function authHeaders(extra = {}) {
    const token = getToken();
    return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
  }

  async function checkAdmin() {
    const token = getToken();
    if (!token) return false;
    try {
      const res = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return res.ok && data.authenticated;
    } catch {
      return false;
    }
  }

  function waitForMap() {
    return new Promise((resolve) => {
      if (window.AlheefMap?.map?.()) {
        resolve(window.AlheefMap);
        return;
      }
      document.addEventListener('alheef-map-ready', () => resolve(window.AlheefMap), { once: true });
    });
  }

  function openPanel(lat, lng) {
    if (!els.panel) return;
    pendingLatLng = { lat, lng };
    if (els.lat) els.lat.value = String(lat);
    if (els.lng) els.lng.value = String(lng);
    if (els.coordsLabel) {
      els.coordsLabel.textContent = `الموقع: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    if (!isAdmin && els.coordsLabel) {
      els.coordsLabel.textContent += ' — سجّل الدخول من لوحة التحكم لحفظ الإعلان';
    }
    els.panel.classList.add('open');
    els.panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('map-add-open');
  }

  function closePanel() {
    els.panel?.classList.remove('open');
    els.panel?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('map-add-open');
    addMode = false;
    els.fab?.classList.remove('active');
    if (pickMarker) {
      pickMarker.remove();
      pickMarker = null;
    }
  }

  function setPickMarker(mapApi, lat, lng) {
    if (pickMarker) pickMarker.remove();
    const color = '#C5A46D';
    pickMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'map-pin-wrap',
        html: `<span class="map-marker-pulse map-marker-pulse--pick" style="--pin-color:${color}"><span class="map-marker-core"></span></span>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(mapApi.map());
  }

  function renderPreview(files) {
    if (!els.preview) return;
    els.preview.innerHTML = '';
    Array.from(files || []).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = '';
      img.loading = 'lazy';
      els.preview.appendChild(img);
    });
  }

  function toast(msg, isError) {
    const el = document.createElement('div');
    el.className = `map-add-toast${isError ? ' map-add-toast--err' : ''}`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  function promptLogin() {
    toast('يجب تسجيل الدخول في لوحة التحكم أولاً', true);
    setTimeout(() => {
      if (confirm('الانتقال إلى صفحة تسجيل الدخول؟')) {
        window.location.href = LOGIN_URL;
      }
    }, 400);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isAdmin) {
      promptLogin();
      return;
    }

    if (!pendingLatLng) {
      toast('حدد الموقع بالنقر على الخريطة أولاً', true);
      return;
    }

    const fd = new FormData(els.form);
    const city = (fd.get('city') || '').trim();
    const district = (fd.get('district') || '').trim();
    const propertyType = fd.get('propertyType') || '';
    if (!propertyType || !city) {
      toast('أكمل نوع العقار والمدينة', true);
      return;
    }

    fd.set('location', [city, district].filter(Boolean).join(' — ') || city);
    fd.set('title', `${propertyType} — ${fd.get('location')}`);
    fd.set('description', (fd.get('description') || '').trim());
    fd.set('latitude', String(pendingLatLng.lat));
    fd.set('longitude', String(pendingLatLng.lng));
    fd.set('status', 'published');

    const priceType = els.form.querySelector('input[name="priceType"]:checked')?.value || 'fixed';
    fd.set('priceType', priceType);

    const fileInput = els.images;
    if (fileInput?.files?.length) {
      Array.from(fileInput.files).forEach((f) => fd.append('images', f));
    }

    if (els.submit) {
      els.submit.disabled = true;
      els.submit.textContent = 'جاري الحفظ…';
    }

    try {
      const res = await fetch('/api/admin/offers', {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        isAdmin = false;
        promptLogin();
        return;
      }
      if (!res.ok) throw new Error(data.message || 'فشل الحفظ');

      const mapApi = await waitForMap();
      const mp = data.mapProperty;
      if (mp && mapApi?.addPropertyToMap) {
        mapApi.addPropertyToMap(mp);
        const m = mapApi.map();
        if (m) m.setView([mp.latitude, mp.longitude], Math.max(m.getZoom(), 15));
      }

      toast(data.message || 'تم الحفظ — يظهر على الخريطة');
      els.form.reset();
      renderPreview([]);
      closePanel();
    } catch (err) {
      toast(err.message || 'حدث خطأ أثناء الحفظ', true);
    } finally {
      if (els.submit) {
        els.submit.disabled = false;
        els.submit.textContent = 'حفظ وإظهار على الخريطة';
      }
    }
  }

  function onMapClick(mapApi, e) {
    if (!addMode) return;
    const { lat, lng } = e.latlng;
    setPickMarker(mapApi, lat, lng);
    openPanel(lat, lng);
  }

  function setupMapClick(mapApi) {
    const map = mapApi.map();
    if (!map) return;
    map.on('click', (e) => onMapClick(mapApi, e));
  }

  function bindUi(mapApi) {
    els.fab?.addEventListener('click', () => {
      if (!isAdmin) {
        promptLogin();
        return;
      }
      addMode = !addMode;
      els.fab.classList.toggle('active', addMode);
      if (!addMode) {
        closePanel();
        return;
      }
      toast('انقر على الخريطة لتحديد موقع العقار');
    });

    els.close?.addEventListener('click', closePanel);
    els.backdrop?.addEventListener('click', closePanel);
    els.form?.addEventListener('submit', handleSubmit);
    els.images?.addEventListener('change', (ev) => renderPreview(ev.target.files));
  }

  function updateFabState() {
    if (!els.fab) return;
    if (isAdmin) {
      els.fab.title = 'إضافة عقار — انقر ثم حدد الموقع على الخريطة';
      els.fab.classList.remove('map-add-fab--guest');
    } else {
      els.fab.title = 'تسجيل الدخول مطلوب لإضافة عقار';
      els.fab.classList.add('map-add-fab--guest');
    }
  }

  async function init() {
    isAdmin = await checkAdmin();
    updateFabState();

    const mapApi = await waitForMap();
    setupMapClick(mapApi);
    bindUi(mapApi);

    window.AlheefMapAdd = {
      isAdmin: () => isAdmin,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
