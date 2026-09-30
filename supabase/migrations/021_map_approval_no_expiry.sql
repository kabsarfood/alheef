-- طلبات موافقة الخريطة تبقى معلّقة حتى قرار الأدمن.
-- approval_expires_at يبقى فارغًا وغير مستخدم في هذا المسار.

ALTER TABLE map_publish_requests
  ADD COLUMN IF NOT EXISTS approve_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS reject_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS open_code_hash TEXT;

ALTER TABLE map_publish_requests DROP CONSTRAINT IF EXISTS map_publish_requests_status_check;
ALTER TABLE map_publish_requests ADD CONSTRAINT map_publish_requests_status_check CHECK (
  status IN (
    'pending_approval', 'approved', 'publishing', 'published',
    'rejected', 'expired', 'duplicate', 'failed', 'cancelled'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_publish_approve_code
  ON map_publish_requests (approve_code_hash)
  WHERE approve_code_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_publish_reject_code
  ON map_publish_requests (reject_code_hash)
  WHERE reject_code_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_publish_open_code
  ON map_publish_requests (open_code_hash)
  WHERE open_code_hash IS NOT NULL;
