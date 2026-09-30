/** نفس قائمة server/utils/propertyTypes.js — القيمة المخزّنة عربية. */
window.AlheefPropertyTypes = {
  options: [
    { key: 'land', label: 'أرض سكنية', group: 'أراضي' },
    { key: 'land', label: 'أرض تجارية', group: 'أراضي' },
    { key: 'land', label: 'أرض زراعية', group: 'أراضي' },
    { key: 'villa', label: 'فيلا', group: 'عقارات' },
    { key: 'duplex', label: 'دوبلكس', group: 'عقارات' },
    { key: 'apartment', label: 'شقة', group: 'عقارات' },
    { key: 'building', label: 'عمارة', group: 'عقارات' },
    { key: 'palace', label: 'قصر', group: 'عقارات' },
    { key: 'tower', label: 'برج', group: 'عقارات' },
    { key: 'rest_house', label: 'استراحة', group: 'عقارات' },
    { key: 'shop', label: 'محل', group: 'عقارات' },
    { key: 'office', label: 'مكتب', group: 'عقارات' },
    { key: 'commercial', label: 'عقار تجاري', group: 'عقارات' },
  ],

  labels() {
    return this.options.map((item) => item.label);
  },

  /** خيارات مجمّعة لنموذج أو فلتر. */
  groupedHtml(selected) {
    const current = String(selected || '');
    const groups = [];
    this.options.forEach((item) => {
      let group = groups.find((g) => g.label === item.group);
      if (!group) {
        group = { label: item.group, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    });
    return groups.map((group) => `
      <optgroup label="${group.label}">
        ${group.items.map((item) => `<option value="${item.label}"${item.label === current ? ' selected' : ''}>${item.label}</option>`).join('')}
      </optgroup>
    `).join('');
  },
};
