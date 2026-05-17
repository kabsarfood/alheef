#!/usr/bin/env node
/**
 * ترحيل بيانات JSON المحلية إلى Supabase
 * الاستخدام: node scripts/migrate-json-to-supabase.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { initSupabase, isEnabled, getAdmin } = require('../server/lib/supabase');
const { settingsToRow, propertyToRow } = require('../server/services/mappers');
const { rowToSettings } = require('../server/services/mappers');
const { DEFAULT_SETTINGS } = require('../server/utils/settingsDefaults');
const { formatPriceDisplay, buildTitle } = require('../server/utils/offers');

const DATA = path.join(__dirname, '..', 'data');

function readJson(name, fallback) {
  const p = path.join(DATA, name);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function migrateSettings() {
  const raw = readJson('settings.json', DEFAULT_SETTINGS);
  const app = { ...DEFAULT_SETTINGS, ...raw };
  const row = settingsToRow(app);
  const { error } = await getAdmin().from('settings').upsert(row);
  if (error) throw error;
  console.log('✓ settings');
}

async function migrateProperties() {
  const offers = readJson('offers.json', []);
  for (const o of offers) {
    const row = {
      ...propertyToRow({
        ...o,
        propertyType: o.propertyType || o.type,
        title: o.title || buildTitle(o),
        priceDisplay: o.priceDisplay || formatPriceDisplay(o.price),
      }),
      price_display: o.priceDisplay || formatPriceDisplay(o.price),
      title: o.title || buildTitle(o),
      created_at: o.createdAt || new Date().toISOString(),
    };
    const { error } = await getAdmin().from('properties').insert(row);
    if (error) console.warn('  skip offer:', o.title, error.message);
    else console.log('  ✓ property:', row.title);
  }
}

async function migrateNews() {
  const items = readJson('news.json', []);
  for (const n of items) {
    const { error } = await getAdmin().from('news').insert({
      title: n.title,
      content: n.content,
      image: n.image || '',
      category: n.category || 'عام',
      status: n.status || 'published',
      created_at: n.createdAt,
    });
    if (error) console.warn('  skip news:', n.title, error.message);
    else console.log('  ✓ news:', n.title);
  }
}

async function migrateRequests() {
  const requests = readJson('requests.json', []);
  for (const r of requests) {
    await getAdmin().from('requests').insert({
      phone: r.phone,
      request_type: 'property_search',
      details: {
        propertyType: r.propertyType,
        city: r.city,
        district: r.district,
        budget: r.budget,
        description: r.description,
      },
      created_at: r.createdAt,
    });
  }
  console.log(`✓ ${requests.length} property requests`);
}

async function migrateListings() {
  const listings = readJson('listings.json', []);
  for (const l of listings) {
    await getAdmin().from('requests').insert({
      name: l.ownerName,
      phone: l.phone,
      request_type: 'owner_listing',
      details: {
        propertyType: l.propertyType,
        city: l.city,
        description: l.description,
        images: l.images || [],
      },
      created_at: l.createdAt,
    });
  }
  console.log(`✓ ${listings.length} owner listings`);
}

async function migrateSubscriptions() {
  const subs = readJson('subscriptions.json', []);
  for (const s of subs) {
    await getAdmin().from('subscriptions').insert({
      name: s.name,
      phone: s.phone,
      interests: s.interests || '',
      created_at: s.createdAt,
    });
  }
  console.log(`✓ ${subs.length} subscriptions`);
}

async function main() {
  if (!initSupabase()) {
    console.error('عيّن SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في .env');
    process.exit(1);
  }

  console.log('بدء الترحيل...\n');
  await migrateSettings();
  await migrateProperties();
  await migrateNews();
  await migrateRequests();
  await migrateListings();
  await migrateSubscriptions();
  console.log('\nاكتمل الترحيل.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
