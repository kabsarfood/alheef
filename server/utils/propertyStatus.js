const { PUBLIC_STATUSES } = require('./marketerZones');

const MARKETER_EDITABLE = new Set(['draft', 'pending_review', 'needs_changes']);

function isPublicStatus(status) {
  return PUBLIC_STATUSES.includes(status);
}

function canMarketerEdit(status) {
  return MARKETER_EDITABLE.has(status);
}

function canMarketerDelete(status) {
  return status !== 'approved_published' && status !== 'published';
}

module.exports = {
  PUBLIC_STATUSES,
  MARKETER_EDITABLE,
  isPublicStatus,
  canMarketerEdit,
  canMarketerDelete,
};
