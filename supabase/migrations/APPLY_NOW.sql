-- نفّذ هذا الملف في Supabase → SQL Editor
-- https://supabase.com/dashboard/project/imostnqoxeqefshtzcxd/sql/new

-- ═══ جداول فريق المسوقين ═══
CREATE TABLE IF NOT EXISTS marketer_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  national_id TEXT NOT NULL,
  fal_license TEXT NOT NULL,
  marketing_zone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  CONSTRAINT marketer_join_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'needs_info')
  )
);

CREATE TABLE IF NOT EXISTS marketers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  join_request_id UUID REFERENCES marketer_join_requests(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  national_id TEXT NOT NULL,
  fal_license TEXT NOT NULL,
  marketing_zone TEXT NOT NULL,
  password_hash TEXT,
  must_set_password BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══ أعمدة العقارات ═══
ALTER TABLE properties ADD COLUMN IF NOT EXISTS marketer_id UUID REFERENCES marketers(id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS license_expires_at DATE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS brokerage_contract_no TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS facade TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS admin_feedback TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS homepage_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS inquiry_count INT NOT NULL DEFAULT 0;

-- حالات الإعلان (بما فيها pending_review و rejected)
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_status_check CHECK (
  status IN (
    'draft', 'pending_review', 'needs_changes', 'approved_published',
    'published', 'hidden', 'expired', 'archived', 'sold', 'rejected'
  )
);

CREATE INDEX IF NOT EXISTS idx_properties_marketer ON properties(marketer_id);
CREATE INDEX IF NOT EXISTS idx_properties_license_expires ON properties(license_expires_at);

-- إشعارات مراجعة الإعلانات (إن لم تكن موجودة)
CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'property_pending_review',
  title TEXT NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  marketer_id UUID REFERENCES marketers(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON admin_notifications(is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_property ON admin_notifications(property_id);

-- ═══ بريد المسوق + استعادة كلمة المرور (007) ═══
ALTER TABLE marketer_join_requests ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE marketer_join_requests ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE marketers ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketer_join_email_unique ON marketer_join_requests(lower(trim(email))) WHERE email IS NOT NULL AND trim(email) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketers_email_unique ON marketers(lower(trim(email))) WHERE email IS NOT NULL AND trim(email) <> '';
CREATE TABLE IF NOT EXISTS marketer_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketer_id UUID NOT NULL REFERENCES marketers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketer_reset_tokens_marketer ON marketer_password_reset_tokens(marketer_id, created_at DESC);
