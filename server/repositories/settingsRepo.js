const { getAdmin, isEnabled } = require('../lib/supabase');
const { DEFAULT_SETTINGS } = require('../utils/settingsDefaults');
const { rowToSettings, settingsToRow } = require('../services/mappers');

const TABLE = 'settings';
const ROW_ID = 'main';

async function getSettings() {
  if (!isEnabled()) return { ...DEFAULT_SETTINGS };

  const { data, error } = await getAdmin().from(TABLE).select('*').eq('id', ROW_ID).maybeSingle();
  if (error) {
    console.error('[settingsRepo]', error.message);
    return { ...DEFAULT_SETTINGS };
  }
  if (!data) {
    const row = settingsToRow(DEFAULT_SETTINGS);
    await getAdmin().from(TABLE).upsert(row);
    return rowToSettings(row);
  }
  return rowToSettings(data);
}

async function saveSettings(updates) {
  const current = await getSettings();
  const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };

  if (!isEnabled()) {
    console.warn('[settingsRepo] Supabase غير متصل');
    return merged;
  }

  const row = settingsToRow(merged);
  const { data, error } = await getAdmin().from(TABLE).upsert(row).select().single();
  if (error) throw new Error('فشل حفظ الإعدادات');
  return rowToSettings(data);
}

module.exports = { getSettings, saveSettings };
