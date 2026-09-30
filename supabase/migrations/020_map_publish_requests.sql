-- طلبات نشر الخريطة عبر موافقة واتساب. لا يغيّر جدول properties ولا بياناته.

CREATE TABLE IF NOT EXISTS map_publish_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT NOT NULL UNIQUE,
  payload_json JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  external_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  approval_token_hash TEXT,
  approval_expires_at TIMESTAMPTZ,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  property_status TEXT,
  duplicate_of_request_id UUID,
  duplicate_of_property_id UUID,
  failure_reason TEXT,
  idempotency_key TEXT,
  approval_consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT map_publish_requests_status_check CHECK (
    status IN (
      'pending_approval', 'approved', 'publishing', 'published',
      'rejected', 'expired', 'duplicate', 'failed'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_publish_hash_active
  ON map_publish_requests (payload_hash)
  WHERE status IN ('pending_approval', 'approved', 'publishing', 'published');

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_publish_idempotency
  ON map_publish_requests (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '';

CREATE INDEX IF NOT EXISTS idx_map_publish_status_created
  ON map_publish_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS map_publish_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES map_publish_requests(id) ON DELETE CASCADE,
  request_number TEXT,
  event TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_publish_audit_request
  ON map_publish_audit (request_id, created_at);

CREATE TABLE IF NOT EXISTS map_publish_webhook_events (
  webhook_id TEXT PRIMARY KEY,
  request_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE map_publish_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_publish_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_publish_webhook_events ENABLE ROW LEVEL SECURITY;
