-- رابط إضافة لمرة واحدة. يخزن بصمة الرمز فقط، ولا يغيّر جدول العقارات.

CREATE TABLE IF NOT EXISTS map_submit_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'new',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  request_id UUID REFERENCES map_publish_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT map_submit_links_status_check CHECK (
    status IN ('new', 'used', 'expired', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_map_submit_links_status_created
  ON map_submit_links (status, created_at DESC);

ALTER TABLE map_submit_links ENABLE ROW LEVEL SECURITY;
