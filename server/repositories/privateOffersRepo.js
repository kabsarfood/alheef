const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToPrivateOffer, privateOfferToRow, toPublicPrivateOffer } = require('../services/mappers');

const TABLE = 'private_offers';

async function nextOfferNumber() {
  const { data } = await getAdmin()
    .from(TABLE)
    .select('offer_number')
    .order('created_at', { ascending: false })
    .limit(1);
  const last = (data || [])[0]?.offer_number || '';
  const match = last.match(/ALH-PRIVATE-(\d+)/i);
  const next = match ? Number(match[1]) + 1 : 1;
  return `ALH-PRIVATE-${String(next).padStart(3, '0')}`;
}

async function listAll() {
  if (!isEnabled()) return [];
  const { data } = await getAdmin()
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  return (data || []).map(rowToPrivateOffer);
}

async function listPublic() {
  if (!isEnabled()) return [];
  const { data } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('active', true)
    .eq('visible', true)
    .neq('status', 'hidden')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  return (data || []).map(rowToPrivateOffer).map(toPublicPrivateOffer);
}

async function getById(id) {
  const { data } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  return rowToPrivateOffer(data);
}

async function create(body) {
  const offerNumber = await nextOfferNumber();
  const row = privateOfferToRow({ ...body, offerNumber });
  row.offer_number = offerNumber;
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) {
    if (/listing_type/i.test(error.message)) {
      delete row.listing_type;
      const retry = await getAdmin().from(TABLE).insert(row).select().single();
      if (retry.error) throw new Error(retry.error.message);
      return rowToPrivateOffer(retry.data);
    }
    throw new Error(error.message);
  }
  return rowToPrivateOffer(data);
}

async function update(id, body) {
  const row = privateOfferToRow(body);
  delete row.offer_number;
  row.updated_at = new Date().toISOString();
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  const { data, error } = await getAdmin().from(TABLE).update(row).eq('id', id).select().single();
  if (error) {
    if (/listing_type/i.test(error.message)) {
      delete row.listing_type;
      const retry = await getAdmin().from(TABLE).update(row).eq('id', id).select().single();
      if (retry.error) throw new Error(retry.error.message);
      return rowToPrivateOffer(retry.data);
    }
    throw new Error(error.message);
  }
  return rowToPrivateOffer(data);
}

async function remove(id) {
  const { error } = await getAdmin().from(TABLE).delete().eq('id', id);
  return !error;
}

module.exports = {
  listAll,
  listPublic,
  getById,
  create,
  update,
  remove,
  nextOfferNumber,
};
