-- مصدر الإعلان وسجل الاستيراد. لا يحذف أعمدة ولا يغيّر الصفوف القديمة.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_listing_id TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_import_id TEXT;

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_source_check;
ALTER TABLE properties ADD CONSTRAINT properties_source_check
  CHECK (
    source IS NULL
    OR source IN ('alheef', 'chatgpt', 'haraj', 'aqar', 'whatsapp', 'manual', 'other')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_source_listing
  ON properties (source, source_listing_id)
  WHERE source IS NOT NULL AND btrim(source) <> ''
    AND source_listing_id IS NOT NULL AND btrim(source_listing_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_source_import
  ON properties (source_import_id)
  WHERE source_import_id IS NOT NULL AND btrim(source_import_id) <> '';

CREATE TABLE IF NOT EXISTS property_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  source TEXT,
  source_url TEXT,
  source_listing_id TEXT,
  source_import_id TEXT,
  publish_mode TEXT,
  result TEXT NOT NULL,
  duplicate_of UUID,
  duplicate_type TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_import_logs_import_id
  ON property_import_logs (source_import_id)
  WHERE source_import_id IS NOT NULL AND btrim(source_import_id) <> '';

ALTER TABLE property_import_logs ENABLE ROW LEVEL SECURITY;
