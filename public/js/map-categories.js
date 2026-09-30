/**
 * تصنيف عرض الخريطة فقط. لا يغيّر property_type المخزّن.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AlheefMapCategories = api;
})(typeof window !== 'undefined' ? window : global, function () {
  const CATEGORIES = [
    { id: 'land', label: 'أرض', color: '#22C55E', names: ['أرض', 'أراضي', 'ارض', 'أرض سكنية', 'ارض سكنية', 'أرض تجارية', 'ارض تجارية', 'أرض زراعية', 'ارض زراعية'] },
    { id: 'villa', label: 'فيلا', color: '#C5A46D', names: ['فيلا', 'فلل', 'فله', 'دوبلكس', 'دبلكس', 'قصر'] },
    { id: 'apartment', label: 'شقة', color: '#3B82F6', names: ['شقة', 'شقق', 'شقه'] },
    { id: 'building', label: 'عمارة', color: '#64748B', names: ['عمارة', 'عمائر', 'عماره', 'برج'] },
  ];

  function fold(value) {
    return String(value || '')
      .trim()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ');
  }

  function categoryOf(propertyType) {
    const text = fold(propertyType);
    if (!text) return '';
    const hit = CATEGORIES.find((item) => item.names.some((name) => fold(name) === text));
    if (hit) return hit.id;
    if (text.includes('ارض')) return 'land';
    if (text.includes('فيل') || text.includes('فله') || text.includes('دوبلكس') || text.includes('دبلكس') || text.includes('قصر')) return 'villa';
    if (text.includes('شقه') || text.includes('شقق')) return 'apartment';
    if (text.includes('عمار') || text.includes('برج')) return 'building';
    return '';
  }

  function colorOf(propertyType) {
    const id = categoryOf(propertyType);
    return CATEGORIES.find((item) => item.id === id)?.color || '';
  }

  return { CATEGORIES, categoryOf, colorOf, fold };
});
