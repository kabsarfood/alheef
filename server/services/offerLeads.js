const crypto = require('crypto');
const { getAdmin } = require('../lib/supabase');
const { normalizeAccountPhone } = require('../utils/phone');
const { FULL_PHONE_RE } = require('../utils/publicPropertySanitize');
const evolution = require('./evolutionWhatsApp');
const offerBoard = require('./offerBoard');

const FOLLOWUP_MS = Number(process.env.OFFER_LEAD_FOLLOWUP_MS) || (2 * 24 * 60 * 60 * 1000);
const SHARE_DEBOUNCE_MS = 2 * 60 * 1000;
const STATUS_LABELS = {
  pending_followup: 'بانتظار المتابعة',
  interested: 'مهتم',
  not_interested: 'غير مهتم',
  wants_alternatives: 'يريد عروضًا أخرى',
  negotiating: 'تحت التفاوض',
  stopped: 'متابعة متوقفة',
  closed: 'غير مهتم',
};
const CHOICES = {
  yes: { title: 'هل أعجبك العرض؟', label: 'نعم، أعجبني', wait: 'جارٍ التسجيل…', done: 'تم تسجيل اهتمامك. سيتواصل معك الهيف.' },
  no: { title: 'لم يعجبك العرض', label: 'لا، لم يعجبني', wait: 'جارٍ التسجيل…', done: 'شكرًا لك. أرسلنا سؤالًا قصيرًا إلى واتسابك.' },
  more: { title: 'عروض أخرى', label: 'أريد عروضًا أخرى', wait: 'جارٍ التسجيل…', done: 'وصل طلبك إلى الهيف، وسيتواصل معك لاختيار عروض أنسب.' },
  stop: { title: 'إيقاف المتابعة', label: 'إيقاف', wait: 'جارٍ الإيقاف…', done: 'تم إيقاف رسائل المتابعة. بياناتك محفوظة.' },
  more_yes: { title: 'عروض أخرى', label: 'نعم، أريد عروضًا أخرى', wait: 'جارٍ التسجيل…', done: 'وصل طلبك إلى الهيف، وسيتواصل معك.' },
  more_no: { title: 'إنهاء متابعة هذا العرض', label: 'لا، شكرًا', wait: 'جارٍ التسجيل…', done: 'انتهت متابعة هذا العرض، وحسابك ما زال محفوظًا.' },
};

function publicBase() {
  return String(process.env.ALHEEF_PUBLIC_BASE_URL || process.env.SITE_URL || 'https://www.alheef.website').replace(/\/$/, '');
}

function adminPhone() {
  return normalizeAccountPhone(process.env.ALHEEF_MAP_ADMIN_PHONE || process.env.ADMIN_PHONE || '0530792754');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function newCode() {
  return crypto.randomBytes(9).toString('base64url');
}

function stripPhones(value) {
  const text = String(value || '');
  FULL_PHONE_RE.lastIndex = 0;
  return text.replace(FULL_PHONE_RE, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `${amount.toLocaleString('ar-SA')} ر.س` : 'عند الطلب';
}

function line(label, value) {
  const text = stripPhones(value);
  return text ? `${label}: ${text}` : '';
}

function stripLinks(value) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}\/\S*/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function shareFacts(value) {
  return stripLinks(stripPhones(value));
}

function shareLocation(item) {
  const maps = String(item.mapsUrl || '').trim();
  if (/^https?:\/\//i.test(maps) && !/property\.html|\/dashboard\/|\/v\/|\/p\//i.test(maps)) return maps;
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  return '';
}

function shareImages(item) {
  const urls = []
    .concat(Array.isArray(item.gallery) ? item.gallery : [])
    .concat(item.coverImage || []);
  const seen = new Set();
  const images = [];
  urls.forEach((url) => {
    const clean = String(url || '').trim();
    if (!/^https?:\/\//i.test(clean) || seen.has(clean)) return;
    seen.add(clean);
    images.push(clean);
  });
  return images.slice(0, 8);
}

async function loadShareImages(item) {
  const ready = shareImages(item);
  if (ready.length || !item?.id) return ready;
  const { data } = await getAdmin()
    .from('property_images')
    .select('image_url, sort_order')
    .eq('property_id', item.id)
    .order('sort_order', { ascending: true });
  return shareImages({ gallery: (data || []).map((row) => row.image_url) });
}

function buildShareText(item) {
  const location = shareLocation(item);
  const lines = [
    'تمت مشاركتك تفاصيل العقار 👇',
    '',
    line('نوع العقار', shareFacts(item.propertyType)),
    line('المدينة', shareFacts(item.city)),
    line('الحي', shareFacts(item.district)),
    location ? `الموقع: ${location}` : '',
    `السعر: ${money(item.price)}`,
    line('المساحة', item.area ? `${item.area} م²` : ''),
    item.pricePerMeter ? `سعر المتر: ${money(item.pricePerMeter)}` : '',
    line('الاتجاه', shareFacts(item.direction)),
    line('الشارع', shareFacts(item.street)),
    line('عرض الشارع', shareFacts(item.streetWidth)),
    line('الأطوال', shareFacts(item.lengths)),
    line('رقم المخطط', shareFacts(item.planNumber)),
    line('رقم القطعة', shareFacts(item.plotNumber)),
    line('رقم العرض', shareFacts(item.internalRef)),
  ].filter(Boolean);
  const details = shareFacts(item.description);
  if (details) lines.push('', 'التفاصيل:', details.slice(0, 2500));
  lines.push('', 'للتواصل أو التسويق أو الاستشارة عبر منصة الهيف فقط:', adminPhone() || '0530792754');
  return lines.join('\n');
}

function choiceUrl(code) {
  return `${publicBase()}/f/${code}`;
}

function followupText(lead, codes) {
  const title = stripPhones(lead.property_title || lead.internal_ref || 'العرض');
  return [
    'السلام عليكم ورحمة الله وبركاته',
    'هل العرض الذي اخترته مناسب لكم؟',
    title ? `العقار: ${title}${lead.internal_ref ? ` — ${lead.internal_ref}` : ''}` : '',
    '',
    '1 — نعم، أعجبني',
    choiceUrl(codes.yes),
    '',
    '2 — لا، لم يعجبني',
    choiceUrl(codes.no),
    '',
    '3 — أريد عروضًا أخرى',
    choiceUrl(codes.more),
    '',
    '4 — إيقاف',
    choiceUrl(codes.stop),
  ].filter((line) => line !== '').join('\n');
}

function secondQuestionText(codes) {
  return [
    'شكرًا لك. هل ترغب أن نرسل لك عروضًا أخرى مناسبة؟',
    '',
    'نعم، أريد عروضًا أخرى',
    choiceUrl(codes.more_yes),
    '',
    'لا، شكرًا',
    choiceUrl(codes.more_no),
  ].join('\n');
}

function missingPage() {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الرابط غير صالح</title></head><body style="font-family:Tahoma,sans-serif;text-align:center;padding:2rem"><h1>الرابط غير صالح</h1></body></html>`;
}

function pageHtml(choice, state) {
  const spec = CHOICES[choice] || CHOICES.yes;
  const waiting = state === 'confirm';
  const label = waiting ? spec.label : spec.done;
  const button = waiting
    ? `<form method="post"><button type="submit" class="go">${spec.label}</button></form><script>
(function(){var f=document.querySelector('form');var b=f.querySelector('button');var sent=false;b.addEventListener('pointerdown',function(){b.classList.add('pressed');});f.addEventListener('submit',function(e){if(sent){e.preventDefault();return;}sent=true;b.textContent=${JSON.stringify(spec.wait)};});})();
</script>`
    : `<p class="done">${spec.done}</p>`;
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${spec.title}</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:1.25rem;background:#f3f6f1;color:#142016;font-family:Tahoma,"Segoe UI",sans-serif;text-align:center}
main{width:min(100%,26rem)}h1{font-size:1.55rem;line-height:1.45;margin:0 0 1rem}button,.done{width:100%;min-height:5rem;border:0;border-radius:1.1rem;font:inherit;font-size:1.45rem;font-weight:800}
button{background:#178a45;color:#fff;box-shadow:0 .45rem 0 #0d5a2b;cursor:pointer;touch-action:manipulation}button.pressed,button:active{transform:translateY(.2rem)}
.done{display:flex;align-items:center;justify-content:center;background:#fff;color:#142016;box-shadow:0 12px 30px rgba(16,24,32,.08)}
</style></head><body><main><h1>${spec.title}</h1>${button}</main></body></html>`;
}

async function clientRow(clientId) {
  const { data } = await getAdmin()
    .from('private_client_access')
    .select('id, phone, client_label, active, followup_paused')
    .eq('id', clientId)
    .maybeSingle();
  return data || null;
}

async function recentShare(clientId, propertyId) {
  const since = new Date(Date.now() - SHARE_DEBOUNCE_MS).toISOString();
  const { data } = await getAdmin()
    .from('private_offer_leads')
    .select('id')
    .eq('client_access_id', clientId)
    .eq('property_id', propertyId)
    .gte('shared_at', since)
    .limit(1);
  return Boolean(data && data.length);
}

async function shareListing({ clientId, propertyId, audience } = {}) {
  const forAdmin = audience === 'admin';
  const sent = forAdmin ? 'تم إرسال الإعلان إلى واتساب العميل' : 'تم إرسال تفاصيل الإعلان إلى واتسابك';
  const client = await clientRow(clientId);
  if (!client || client.active === false) {
    return { status: 403, body: { success: false, message: 'الدعوة غير فعّالة' } };
  }
  const item = await offerBoard.getBoardItem(propertyId, { admin: forAdmin });
  if (!item || (forAdmin && !['published', 'approved_published'].includes(item.status))) {
    return { status: 404, body: { success: false, message: 'العرض غير متاح' } };
  }
  if (forAdmin && item.showOnPrivateOffers === false) {
    await offerBoard.applyAction(propertyId, 'offers_on');
  }
  if (await recentShare(clientId, propertyId)) {
    return { status: 200, body: { success: true, duplicate: true, message: sent } };
  }
  const now = new Date();
  const leadRow = {
    client_access_id: clientId,
    property_id: propertyId,
    internal_ref: String(item.internalRef || '').slice(0, 40),
    property_title: stripPhones(item.title || item.district || item.propertyType || '').slice(0, 180),
    status: 'pending_followup',
    shared_at: now.toISOString(),
    followup_due_at: new Date(now.getTime() + FOLLOWUP_MS).toISOString(),
    last_contact_at: now.toISOString(),
  };
  const inserted = await getAdmin().from('private_offer_leads').insert(leadRow).select('id').single();
  if (inserted.error) return { status: 500, body: { success: false, message: 'تعذر تسجيل المشاركة' } };
  const text = buildShareText(item);
  const images = await loadShareImages(item);
  try {
    for (let index = 0; index < images.length; index += 1) {
      const photo = await evolution.sendImageUrl(client.phone, images[index], index === 0 ? 'صور العقار' : 'صورة العقار');
      if (!photo?.ok) console.warn('[offer-leads] image was not delivered');
      if (index < images.length - 1) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await evolution.sendText(client.phone, text);
  } catch (error) {
    await getAdmin().from('private_offer_leads').delete().eq('id', inserted.data.id);
    return { status: 502, body: { success: false, message: 'تعذر إرسال الإعلان إلى واتساب' } };
  }
  return { status: 200, body: { success: true, message: sent } };
}

async function saveCodes(leadId, pairs) {
  const rows = pairs.map(([action, code]) => ({
    code_hash: hashCode(code),
    lead_id: leadId,
    action,
  }));
  const { error } = await getAdmin().from('private_offer_lead_codes').insert(rows);
  if (error) throw new Error('تعذر حفظ روابط المتابعة');
}

async function notifyAdmin(text) {
  const phone = adminPhone();
  if (!phone) return;
  try {
    await evolution.sendText(phone, text);
  } catch (error) {
    console.warn('[offer-leads] admin notice failed');
  }
}

async function processDueFollowups() {
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await getAdmin()
    .from('private_offer_leads')
    .update({ followup_claim_at: null })
    .lt('followup_claim_at', stale)
    .is('followup_sent_at', null);
  const { data, error } = await getAdmin()
    .from('private_offer_leads')
    .select('id, client_access_id, internal_ref, property_title, status')
    .eq('status', 'pending_followup')
    .is('followup_sent_at', null)
    .is('followup_skipped_at', null)
    .lte('followup_due_at', now)
    .limit(20);
  if (error || !data) return;
  for (const lead of data) {
    try {
    const claim = await getAdmin()
      .from('private_offer_leads')
      .update({ followup_claim_at: now, updated_at: now })
      .eq('id', lead.id)
      .is('followup_sent_at', null)
      .is('followup_claim_at', null)
      .select('id')
      .maybeSingle();
    if (!claim.data) continue;
    const client = await clientRow(lead.client_access_id);
    if (!client || client.active === false || client.followup_paused === true) {
      await getAdmin().from('private_offer_leads').update({
        followup_skipped_at: now,
        followup_claim_at: null,
        updated_at: now,
      }).eq('id', lead.id);
      continue;
    }
    const codes = { yes: newCode(), no: newCode(), more: newCode(), stop: newCode() };
    try {
      await saveCodes(lead.id, Object.entries(codes));
      await evolution.sendText(client.phone, followupText(lead, codes));
      await getAdmin().from('private_offer_leads').update({
        followup_sent_at: new Date().toISOString(),
        last_contact_at: new Date().toISOString(),
        followup_claim_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', lead.id);
    } catch (error) {
      await getAdmin().from('private_offer_leads').update({
        followup_claim_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', lead.id);
      console.warn('[offer-leads] followup failed');
    }
    } catch (error) {
      console.warn('[offer-leads] followup failed');
    }
  }
}

async function findCode(code) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(String(code || ''))) return null;
  const { data } = await getAdmin()
    .from('private_offer_lead_codes')
    .select('code_hash, lead_id, action, used_at')
    .eq('code_hash', hashCode(code))
    .maybeSingle();
  return data || null;
}

async function markLead(leadId, patch) {
  const now = new Date().toISOString();
  await getAdmin().from('private_offer_leads').update({
    ...patch,
    updated_at: now,
    last_reply_at: now,
  }).eq('id', leadId);
}

async function applyChoice(row) {
  const leadResult = await getAdmin().from('private_offer_leads').select('*').eq('id', row.lead_id).maybeSingle();
  const lead = leadResult.data;
  if (!lead) return;
  const client = await clientRow(lead.client_access_id);
  const ref = lead.internal_ref || '—';
  const phone = normalizeAccountPhone(client?.phone) || '';
  if (row.action === 'yes' && lead.status === 'pending_followup') {
    await markLead(lead.id, { status: 'interested', last_reply: 'نعم، أعجبني' });
    await notifyAdmin(`العميل ${phone} مهتم بالعقار رقم ${ref}`);
  } else if (row.action === 'no' && lead.status === 'pending_followup') {
    await markLead(lead.id, { status: 'not_interested', last_reply: 'لا، لم يعجبني' });
    if (client && client.followup_paused !== true) {
      const codes = { more_yes: newCode(), more_no: newCode() };
      await saveCodes(lead.id, Object.entries(codes));
      await evolution.sendText(client.phone, secondQuestionText(codes));
    }
  } else if ((row.action === 'more' && lead.status === 'pending_followup') || (row.action === 'more_yes' && lead.status === 'not_interested')) {
    await markLead(lead.id, { status: 'wants_alternatives', last_reply: 'أريد عروضًا أخرى' });
    await notifyAdmin(`العميل ${phone} طلب عروضًا أخرى بعد مشاهدة العقار ${ref}`);
  } else if (row.action === 'more_no' && lead.status === 'not_interested') {
    await markLead(lead.id, { status: 'not_interested', last_reply: 'لا، شكرًا' });
  } else if (row.action === 'stop') {
    await markLead(lead.id, { status: 'stopped', last_reply: 'إيقاف' });
    if (client) {
      await getAdmin().from('private_client_access').update({
        followup_paused: true,
        updated_at: new Date().toISOString(),
      }).eq('id', client.id);
      await getAdmin().from('private_offer_leads').update({
        followup_skipped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('client_access_id', client.id).eq('status', 'pending_followup').is('followup_sent_at', null);
    }
    await notifyAdmin(`العميل ${phone} أوقف رسائل المتابعة بعد العقار ${ref}`);
  }
}

async function openChoice(code) {
  const row = await findCode(code);
  if (!row) return { status: 404, html: missingPage() };
  return { status: 200, html: pageHtml(row.action, row.used_at ? 'done' : 'confirm') };
}

async function decideChoice(code) {
  const row = await findCode(code);
  if (!row) return { status: 404, html: '<p dir="rtl">الرابط غير صالح.</p>' };
  if (row.used_at) return { status: 200, html: pageHtml(row.action, 'done') };
  const claimed = await getAdmin()
    .from('private_offer_lead_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code_hash', row.code_hash)
    .is('used_at', null)
    .select('lead_id, action')
    .maybeSingle();
  if (!claimed.data) return { status: 200, html: pageHtml(row.action, 'done') };
  try {
    await applyChoice(claimed.data);
  } catch (error) {
    console.warn('[offer-leads] decision failed');
  }
  return { status: 200, html: pageHtml(row.action, 'done') };
}

async function listForAdmin() {
  const { data, error } = await getAdmin()
    .from('private_offer_leads')
    .select('id, client_access_id, internal_ref, property_title, status, shared_at, last_reply, last_reply_at, last_contact_at')
    .order('shared_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const ids = [...new Set((data || []).map((row) => row.client_access_id).filter(Boolean))];
  let clients = [];
  if (ids.length) {
    const loaded = await getAdmin()
      .from('private_client_access')
      .select('id, client_label, phone, followup_paused')
      .in('id', ids);
    clients = loaded.data || [];
  }
  const byId = new Map(clients.map((client) => [client.id, client]));
  return (data || []).map((row) => {
    const client = byId.get(row.client_access_id) || {};
    return {
      id: row.id,
      clientId: row.client_access_id,
      clientName: client.client_label || '',
      phone: normalizeAccountPhone(client.phone) || '',
      internalRef: row.internal_ref || '',
      propertyTitle: row.property_title || '',
      sharedAt: row.shared_at,
      status: row.status,
      statusLabel: STATUS_LABELS[row.status] || row.status,
      lastReply: row.last_reply || '',
      lastReplyAt: row.last_reply_at,
      lastContactAt: row.last_contact_at,
      followupPaused: client.followup_paused === true,
    };
  });
}

async function setNegotiating(id) {
  const now = new Date().toISOString();
  const { data, error } = await getAdmin()
    .from('private_offer_leads')
    .update({ status: 'negotiating', last_contact_at: now, updated_at: now })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error || !data) return { status: 404, body: { success: false, message: 'السجل غير موجود' } };
  return { status: 200, body: { success: true } };
}

async function setFollowupPaused(clientId, paused) {
  const { error } = await getAdmin()
    .from('private_client_access')
    .update({ followup_paused: paused === true, updated_at: new Date().toISOString() })
    .eq('id', clientId);
  if (error) return { status: 400, body: { success: false, message: 'تعذر تحديث المتابعة' } };
  return { status: 200, body: { success: true, followupPaused: paused === true } };
}

module.exports = {
  buildShareText,
  stripPhones,
  shareListing,
  processDueFollowups,
  openChoice,
  decideChoice,
  listForAdmin,
  setNegotiating,
  setFollowupPaused,
  STATUS_LABELS,
};
