const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToRequest } = require('../services/mappers');
const {
  riyadhYmd,
  formatReference,
  ALLOWED_STATUSES,
  CREATED_CONTRACT_STATUSES,
} = require('../utils/ejarContract');

const TABLE = 'requests';

async function getById(id) {
  if (!isEnabled() || !id) return null;
  const { data, error } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) return null;
  return rowToRequest(data);
}

async function listAll({ offset = 0, limit = 100 } = {}) {
  if (!isEnabled()) return { items: [], total: 0 };
  const { data, error, count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return { items: [], total: 0 };
  return { items: (data || []).map(rowToRequest), total: count || 0 };
}

function buildInsertRow(body) {
  const row = {
    customer_name: body.customerName || body.customer_name || null,
    customer_phone: body.customerPhone || body.customer_phone || null,
    customer_email: body.customerEmail || body.customer_email || null,
    request_type: body.requestType || body.request_type,
    property_id: body.propertyId || body.property_id || null,
    message: body.message || null,
    status: body.status || 'new',
  };
  const referenceNo = body.referenceNo || body.reference_no;
  if (referenceNo) row.reference_no = referenceNo;
  return row;
}

function isMissingReferenceColumn(error) {
  const msg = String(error?.message || '');
  return /reference_no|schema cache/i.test(msg);
}

async function insertRequest(row) {
  let { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error && row.reference_no && isMissingReferenceColumn(error)) {
    const fallback = { ...row };
    delete fallback.reference_no;
    ({ data, error } = await getAdmin().from(TABLE).insert(fallback).select().single());
  }
  if (error) throw new Error(error.message);
  return rowToRequest(data);
}

async function create(body) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  return insertRequest(buildInsertRow(body));
}

function parseSeq(referenceNo, prefix) {
  const n = parseInt(String(referenceNo || '').slice(prefix.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function nextEjarReference() {
  const ymd = riyadhYmd();
  const prefix = `EJ-${ymd}-`;
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  let max = 0;

  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('reference_no, message')
    .eq('request_type', 'ejar_contract')
    .gte('created_at', `${iso}T00:00:00+03:00`)
    .limit(200);

  if (!error && data?.length) {
    for (const row of data) {
      const fromCol = parseSeq(row.reference_no, prefix);
      let fromMsg = 0;
      try {
        const parsed = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
        fromMsg = parseSeq(parsed?.referenceNo, prefix);
      } catch {
        fromMsg = 0;
      }
      if (fromCol > max) max = fromCol;
      if (fromMsg > max) max = fromMsg;
    }
  } else if (error && isMissingReferenceColumn(error)) {
    const counted = await getAdmin()
      .from(TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('request_type', 'ejar_contract')
      .gte('created_at', `${iso}T00:00:00+03:00`);
    max = counted.count || 0;
  }

  return formatReference(ymd, max + 1);
}

function isUniqueReferenceError(error) {
  return /duplicate key|unique/i.test(String(error?.message || ''));
}

async function createEjarContract(data) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const ymd = riyadhYmd();
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const referenceNo = attempt === 0
      ? await nextEjarReference()
      : formatReference(ymd, parseSeq(await nextEjarReference(), `EJ-${ymd}-`) + attempt);
    const payload = { ...data, referenceNo, status: 'new' };
    const row = buildInsertRow({
      customerName: data.submitterName || `عقد إيجار ${data.contractType}`,
      customerPhone: data.submitterPhone || data.ownerPhone,
      requestType: 'ejar_contract',
      message: JSON.stringify(payload),
      status: 'new',
      referenceNo,
    });
    try {
      const created = await insertRequest(row);
      if (!created.referenceNo) created.referenceNo = referenceNo;
      return created;
    } catch (err) {
      lastError = err;
      if (!isUniqueReferenceError(err) && !isMissingReferenceColumn({ message: err.message })) {
        throw err;
      }
    }
  }
  throw lastError || new Error('تعذر إنشاء رقم الطلب');
}

async function updateStatus(id, status) {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error('حالة الطلب غير صالحة');
  }
  const { data, error } = await getAdmin().from(TABLE).update({ status }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return rowToRequest(data);
}

async function remove(id) {
  const { error } = await getAdmin().from(TABLE).delete().eq('id', id);
  return !error;
}

async function countAll() {
  const { count } = await getAdmin().from(TABLE).select('*', { count: 'exact', head: true });
  return count || 0;
}

async function countByStatus(status) {
  const { count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('status', status);
  return count || 0;
}

async function listCreatedEjarRequestIds() {
  if (!isEnabled()) return [];
  const ids = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await getAdmin()
      .from(TABLE)
      .select('id')
      .eq('request_type', 'ejar_contract')
      .in('status', CREATED_CONTRACT_STATUSES)
      .range(from, from + pageSize - 1);
    if (error) return ids;
    const rows = data || [];
    rows.forEach((row) => {
      if (row.id) ids.push(row.id);
    });
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from > 50000) break;
  }
  return ids;
}

module.exports = {
  listAll,
  getById,
  create,
  createEjarContract,
  nextEjarReference,
  updateStatus,
  remove,
  countAll,
  countByStatus,
  listCreatedEjarRequestIds,
};
