/** تخزين بيانات المسوق في features عند غياب أعمدة الهجرة */
const KEY = 'marketer_meta';

const WORKFLOW_STATUSES = new Set([
  'pending_review', 'needs_changes', 'approved_published', 'rejected', 'hidden', 'expired',
]);

function getFeaturesObj(row) {
  const f = row?.features;
  return f && typeof f === 'object' && !Array.isArray(f) ? f : {};
}

function readMeta(row) {
  const m = getFeaturesObj(row)[KEY] || {};
  return {
    marketerId: row?.marketer_id || m.marketerId || null,
    workflowStatus: m.workflowStatus || null,
    licenseExpiresAt: row?.license_expires_at || m.licenseExpiresAt || null,
    brokerageContractNo: row?.brokerage_contract_no || m.brokerageContractNo || '',
    facade: row?.facade || m.facade || '',
    internalNotes: row?.internal_notes || m.internalNotes || '',
    adminFeedback: row?.admin_feedback || m.adminFeedback || '',
    reviewedBy: row?.reviewed_by || m.reviewedBy || null,
    reviewedAt: row?.reviewed_at || m.reviewedAt || null,
    approvedBy: row?.approved_by || m.approvedBy || null,
    approvedAt: row?.approved_at || m.approvedAt || null,
    homepagePublished: !!(row?.homepage_published ?? m.homepagePublished),
    inquiryCount: row?.inquiry_count ?? m.inquiryCount ?? 0,
  };
}

function resolveWorkflowStatus(dbStatus, meta) {
  if (!meta.marketerId) return dbStatus;
  if (meta.workflowStatus) return meta.workflowStatus;
  if (dbStatus === 'draft') return 'pending_review';
  if (dbStatus === 'published') return 'approved_published';
  if (dbStatus === 'archived' && meta.adminFeedback?.includes('رفض')) return 'rejected';
  return dbStatus;
}

function injectIntoFeatures(features, patch) {
  const f = features && typeof features === 'object' && !Array.isArray(features) ? { ...features } : {};
  const prev = f[KEY] || {};
  const next = { ...prev };
  Object.entries(patch).forEach(([k, v]) => {
    if (v !== undefined) next[k] = v;
  });
  if (Object.keys(next).length) f[KEY] = next;
  return f;
}

function metaFromBody(body, existingRow = null) {
  const prev = existingRow ? readMeta(existingRow) : {};
  const meta = { ...prev };
  if (body.marketerId || body.marketer_id) meta.marketerId = body.marketerId || body.marketer_id;
  if (body.workflowStatus) meta.workflowStatus = body.workflowStatus;
  if (body.status && WORKFLOW_STATUSES.has(body.status)) meta.workflowStatus = body.status;
  if (body.licenseExpiresAt || body.license_expires_at) meta.licenseExpiresAt = body.licenseExpiresAt || body.license_expires_at;
  if (body.brokerageContractNo || body.brokerage_contract_no) meta.brokerageContractNo = body.brokerageContractNo || body.brokerage_contract_no;
  if (body.facade) meta.facade = body.facade;
  if (body.internalNotes != null || body.internal_notes != null) meta.internalNotes = body.internalNotes ?? body.internal_notes ?? '';
  if (body.adminFeedback != null || body.admin_feedback != null) meta.adminFeedback = body.adminFeedback ?? body.admin_feedback ?? '';
  return meta;
}

function workflowToDbPatch(workflowStatus, extra = {}) {
  const meta = { workflowStatus, ...extra };
  let dbStatus = 'draft';
  if (workflowStatus === 'approved_published') {
    dbStatus = 'published';
    meta.homepagePublished = true;
  } else if (workflowStatus === 'rejected' || workflowStatus === 'hidden') {
    dbStatus = 'archived';
  } else if (workflowStatus === 'expired') {
    dbStatus = 'archived';
  } else {
    dbStatus = 'draft';
  }
  return { dbStatus, meta };
}

function isWorkflowStatus(status) {
  return WORKFLOW_STATUSES.has(status);
}

function dbStatusForWorkflowFilter(workflowStatus) {
  if (workflowStatus === 'approved_published') return 'published';
  if (workflowStatus === 'rejected' || workflowStatus === 'hidden' || workflowStatus === 'expired') return 'archived';
  return 'draft';
}

const MARKETER_DB_COLUMNS = [
  'marketer_id', 'license_expires_at', 'brokerage_contract_no', 'facade',
  'internal_notes', 'admin_feedback', 'reviewed_by', 'approved_by',
  'approved_at', 'reviewed_at', 'homepage_published', 'inquiry_count',
];

module.exports = {
  KEY,
  readMeta,
  resolveWorkflowStatus,
  injectIntoFeatures,
  metaFromBody,
  workflowToDbPatch,
  isWorkflowStatus,
  dbStatusForWorkflowFilter,
  MARKETER_DB_COLUMNS,
};
