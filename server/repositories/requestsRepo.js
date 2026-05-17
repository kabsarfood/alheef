const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToPropertyRequest, rowToListing } = require('../services/mappers');

const TABLE = 'requests';

async function createPropertyRequest(payload) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const row = {
    name: null,
    phone: payload.phone,
    request_type: 'property_search',
    details: {
      propertyType: payload.propertyType,
      city: payload.city,
      district: payload.district || '',
      budget: payload.budget || '',
      description: payload.description || '',
    },
  };
  const { error } = await getAdmin().from(TABLE).insert(row);
  if (error) {
    console.error('[requestsRepo] createPropertyRequest:', error.message);
    throw new Error('فشل حفظ الطلب');
  }
}

async function createOwnerListing(payload) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const row = {
    name: payload.ownerName,
    phone: payload.phone,
    request_type: 'owner_listing',
    details: {
      propertyType: payload.propertyType,
      city: payload.city,
      description: payload.description || '',
      images: payload.images || [],
    },
  };
  const { error } = await getAdmin().from(TABLE).insert(row);
  if (error) {
    console.error('[requestsRepo] createOwnerListing:', error.message);
    throw new Error('فشل حفظ العرض');
  }
}

async function listPropertyRequests() {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('request_type', 'property_search')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map(rowToPropertyRequest);
}

async function listOwnerListings() {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('request_type', 'owner_listing')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map(rowToListing);
}

async function countPropertyRequests() {
  if (!isEnabled()) return 0;
  const { count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('request_type', 'property_search');
  return count || 0;
}

async function countOwnerListings() {
  if (!isEnabled()) return 0;
  const { count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('request_type', 'owner_listing');
  return count || 0;
}

module.exports = {
  createPropertyRequest,
  createOwnerListing,
  listPropertyRequests,
  listOwnerListings,
  countPropertyRequests,
  countOwnerListings,
};
