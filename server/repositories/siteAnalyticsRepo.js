const { getAdmin, isEnabled } = require('../lib/supabase');

const STATS_TABLE = 'site_visit_stats';
const SESSIONS_TABLE = 'site_visit_sessions';

function todayDate() {
  return new Date().toISOString().slice(0, 10);
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
}

async function countViewsSince(days) {
  if (!isEnabled()) return 0;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);
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

async function getSummary() {
  const [todayViews, weekViews, monthViews, uniqueWeek] = await Promise.all([
    countViewsToday(),
    countViewsSince(7),
    countViewsSince(30),
    countUniqueSessionsSince(7),
  ]);
  return {
    todayViews,
    weekViews,
    monthViews,
    uniqueVisitorsWeek: uniqueWeek,
  };
}

module.exports = {
  recordPageView,
  getSummary,
  countViewsToday,
};
