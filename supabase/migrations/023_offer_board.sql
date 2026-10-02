-- حقول لوحة العروض والخريطة. لا يحذف عمودًا ولا صفًا. آمن لإعادة التشغيل.
-- الظهور في الرئيسية يبقى على homepage_published الموجود، ولا يُفعَّل هنا.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS show_on_private_offers BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS show_on_map BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS request_number TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lengths TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS advertiser_phone_encrypted TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS advertiser_phone_hash TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS status_log JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_status_check CHECK (
  status IN (
    'draft', 'pending_review', 'needs_changes', 'approved_published',
    'published', 'hidden', 'expired', 'archived', 'sold', 'rejected',
    'withdrawn', 'needs_review'
  )
);

CREATE INDEX IF NOT EXISTS idx_properties_offer_board
  ON properties (status, show_on_private_offers, show_on_map);

CREATE INDEX IF NOT EXISTS idx_properties_request_number
  ON properties (request_number)
  WHERE request_number IS NOT NULL AND btrim(request_number) <> '';
