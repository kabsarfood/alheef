const { getAdmin, isEnabled } = require('../lib/supabase');
const { DEFAULT_SETTINGS } = require('../utils/settingsDefaults');
const { rowToSettings, settingsToRow } = require('../services/mappers');

const TABLE = 'settings';
const ROW_ID = 'main';

async function getSettings() {
  if (!isEnabled()) {
    console.warn('[settingsRepo] fallback → defaults');
    return { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
  }

  try {
    const { data, error } = await getAdmin().from(TABLE).select('*').eq('id', ROW_ID).maybeSingle();
    if (error) throw error;
    if (!data) {
      const row = settingsToRow(DEFAULT_SETTINGS);
      await getAdmin().from(TABLE).upsert(row);
      return rowToSettings(row);
    }
    return rowToSettings(data);
  } catch (err) {
    console.error('[settingsRepo] getSettings error:', err.message);
    return { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
  }
}

async function saveSettings(updates) {
  const current = await getSettings();
  const merged = {
    ...current,
    ...updates,
    hero: { ...current.hero, ...(updates.hero || {}) },
    contact: { ...current.contact, ...(updates.contact || {}) },
    colors: { ...current.colors, ...(updates.colors || {}) },
    updatedAt: new Date().toISOString(),
  };

  if (!isEnabled()) {
    console.warn('[settingsRepo] save skipped — Supabase غير متصل');
    return merged;
  }

  const row = settingsToRow(merged);
  const { data, error } = await getAdmin().from(TABLE).upsert(row).select().single();
  if (error) {
    console.error('[settingsRepo] saveSettings error:', error.message);
    throw new Error('فشل حفظ الإعدادات');
  }
  console.log('[settingsRepo] ✓ settings saved');
  return rowToSettings(data);
}

module.exports = { getSettings, saveSettings };
