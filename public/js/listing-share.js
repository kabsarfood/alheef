(function () {
  'use strict';

  async function open(slug) {
    const key = String(slug || '').trim();
    if (!key) return;
    const res = await fetch(`/api/properties/slug/${encodeURIComponent(key)}/share`, { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.text) throw new Error(data.message || 'تعذر تجهيز المشاركة');
    if (navigator.share && data.image && navigator.canShare) {
      try {
        const fileRes = await fetch(data.image);
        if (fileRes.ok) {
          const blob = await fileRes.blob();
          const file = new File([blob], 'alheef.jpg', { type: blob.type || 'image/jpeg' });
          if (navigator.canShare({ files: [file], text: data.text })) {
            await navigator.share({ files: [file], title: data.title || 'إعلان عقاري', text: data.text });
            return;
          }
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(data.text)}`, '_blank', 'noopener');
  }

  window.AlheefShare = { open };
})();
