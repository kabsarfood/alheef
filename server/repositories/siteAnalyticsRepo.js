const { getAdmin, isEnabled } = require('../lib/supabase');

const STATS_TABLE = 'site_visit_stats';
const SESSIONS_TABLE = 'site_visit_sessions';
const PAGE_SESSIONS_TABLE = 'site_visit_page_sessions';
const EJAR_PATH = '/ejar';
const RIYADH_TZ = 'Asia/Riyadh';

/** يوم تقويمي بتوقيت الرياض — يبدأ 12:00 منتصف الليل وينتهي بعد 24 ساعة */
function dateInRiyadh(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: RIYADH_TZ }).format(date);
}

function todayDate() {
  return dateInRiyadh();
}

function riyadhDateDaysAgo(days) {
  const [year, month, day] = todayDate().split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const then = new Date(utc - Number(days) * 24 * 60 * 60 * 1000);
  return then.toISOString().slice(0, 10);
}

function isEjarPath(path) {
  const p = normalizePath(path);
  return p === EJAR_PATH || p === '/ejar.html';
}

function normalizePath(path) {
  const p = String(path || '/').trim() || '/';
  return p.length > 200 ? p.slice(0, 200) : p;
}

async function recordPageView(path, sessionKey) {
  if (!isEnabled()) return;
  const pagePath = normalizePath(path);
  const visitDate = todayDate();
  const key = String(sessionKey || '').trim().slice(0, 64);
  if (!key) return;

  const { data: existingStat } = await getAdmin()
    .from(STATS_TABLE)
    .select('views')
    .eq('visit_date', visitDate)
    .eq('page_path', pagePath)
    .maybeSingle();

  if (existingStat) {
    await getAdmin()
      .from(STATS_TABLE)
      .update({ views: (existingStat.views || 0) + 1 })
      .eq('visit_date', visitDate)
      .eq('page_path', pagePath);
  } else {
    await getAdmin().from(STATS_TABLE).insert({
      visit_date: visitDate,
      page_path: pagePath,
      views: 1,
    });
  }

  const { data: session } = await getAdmin()
    .from(SESSIONS_TABLE)
    .select('page_count')
    .eq('session_key', key)
    .maybeSingle();

  if (session) {
    await getAdmin()
      .from(SESSIONS_TABLE)
      .update({
        last_seen_at: new Date().toISOString(),
        page_count: (session.page_count || 0) + 1,
      })
      .eq('session_key', key);
  } else {
    await getAdmin().from(SESSIONS_TABLE).insert({
      session_key: key,
      page_count: 1,
    });
  }

  if (isEjarPath(pagePath)) {
    try {
      await recordPageSession(todayDate(), EJAR_PATH, key);
    } catch {
      /* table may not exist yet */
    }
  }
}

async function recordPageSession(visitDate, pagePath, sessionKey) {
  const { data: existing } = await getAdmin()
    .from(PAGE_SESSIONS_TABLE)
    .select('session_key')
    .eq('visit_date', visitDate)
    .eq('page_path', pagePath)
    .eq('session_key', sessionKey)
    .maybeSingle();

  if (existing) return;

  await getAdmin().from(PAGE_SESSIONS_TABLE).insert({
    visit_date: visitDate,
    page_path: pagePath,
    session_key: sessionKey,
  });
}

async function countViewsSince(days) {
  if (!isEnabled()) return 0;
  const sinceStr = riyadhDateDaysAgo(days);
  const { data } = await getAdmin()
    .from(STATS_TABLE)
    .select('views')
    .gte('visit_date', sinceStr);
  return (data || []).reduce((n, r) => n + (r.views || 0), 0);
}

async function countViewsToday() {
  if (!isEnabled()) return 0;
  const { data } = await getAdmin()
    .from(STATS_TABLE)
    .select('views')
    .eq('visit_date', todayDate());
  return (data || []).reduce((n, r) => n + (r.views || 0), 0);
}

async function countUniqueSessionsSince(days) {
  if (!isEnabled()) return 0;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await getAdmin()
    .from(SESSIONS_TABLE)
    .select('*', { count: 'exact', head: true })
    .gte('last_seen_at', since);
  if (error) return 0;
  return count || 0;
}

async function countPlatformUniqueVisitorsAllTime() {
  if (!isEnabled()) return 0;
  const { count, error } = await getAdmin()
    .from(SESSIONS_TABLE)
    .select('*', { count: 'exact', head: true });
  if (error) return 0;
  return count || 0;
}

async function countEjarVisitorsToday() {
  if (!isEnabled()) return 0;
  const { count, error } = await getAdmin()
    .from(PAGE_SESSIONS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('visit_date', todayDate())
    .eq('page_path', EJAR_PATH);
  if (error) return 0;
  return count || 0;
}

async function countEjarUniqueVisitorsAllTime() {
  if (!isEnabled()) return 0;
  const keys = new Set();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await getAdmin()
      .from(PAGE_SESSIONS_TABLE)
      .select('session_key')
      .eq('page_path', EJAR_PATH)
      .range(from, from + pageSize - 1);
    if (error) return keys.size;
    const rows = data || [];
    rows.forEach((row) => {
      if (row.session_key) keys.add(row.session_key);
    });
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from > 200000) break;
  }
  return keys.size;
}

async function getSummary() {
  const [todayViews, weekViews, monthViews, uniqueWeek, ejarVisitorsToday] = await Promise.all([
    countViewsToday(),
    countViewsSince(7),
    countViewsSince(30),
    countUniqueSessionsSince(7),
    countEjarVisitorsToday(),
  ]);
  return {
    todayViews,
    weekViews,
    monthViews,
    uniqueVisitorsWeek: uniqueWeek,
    ejarVisitorsToday,
  };
}

module.exports = {
  recordPageView,
  getSummary,
  countViewsToday,
  countEjarUniqueVisitorsAllTime,
  countPlatformUniqueVisitorsAllTime,
  dateInRiyadh,
  todayDate,
  riyadhDateDaysAgo,
};
