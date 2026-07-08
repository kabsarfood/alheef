-- نظام فريق المسوقين — مكتب الهيف

-- طلبات الانضمام
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
  ),
  CONSTRAINT marketer_join_zone_check CHECK (
    marketing_zone IN ('west_riyadh', 'north_riyadh', 'south_riyadh', 'east_riyadh', 'center_riyadh')
  )
);

CREATE INDEX IF NOT EXISTS idx_marketer_join_phone ON marketer_join_requests(phone);
CREATE INDEX IF NOT EXISTS idx_marketer_join_status ON marketer_join_requests(status);

-- حسابات المسوقين
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketers_status_check CHECK (status IN ('active', 'suspended')),
  CONSTRAINT marketers_zone_check CHECK (
    marketing_zone IN ('west_riyadh', 'north_riyadh', 'south_riyadh', 'east_riyadh', 'center_riyadh')
  )
);

CREATE INDEX IF NOT EXISTS idx_marketers_phone ON marketers(phone);
CREATE INDEX IF NOT EXISTS idx_marketers_status ON marketers(status);

-- حقول إضافية للعقارات
ALTER TABLE properties ADD COLUMN IF NOT EXISTS marketer_id UUID REFERENCES marketers(id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS license_expires_at DATE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS brokerage_contract_no TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS facade TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS admin_feedback TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS inquiry_count INT NOT NULL DEFAULT 0;

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_status_check CHECK (
  status IN (
    'draft', 'pending_review', 'needs_changes', 'approved_published',
    'published', 'hidden', 'expired', 'archived', 'sold'
  )
);

CREATE INDEX IF NOT EXISTS idx_properties_marketer ON properties(marketer_id);
CREATE INDEX IF NOT EXISTS idx_properties_license_expires ON properties(license_expires_at);
