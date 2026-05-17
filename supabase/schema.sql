-- ═══════════════════════════════════════════════════════════
-- الهيف — Supabase Schema
-- نفّذ في SQL Editor أو عبر Supabase CLI
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Settings (صف واحد) ───
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  site_name TEXT,
  hero_title TEXT,
  hero_description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  primary_color TEXT DEFAULT '#1E2A38',
  secondary_color TEXT DEFAULT '#C5A46D',
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Properties (العروض / الإعلانات) ───
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no TEXT,
  type TEXT NOT NULL,
  area TEXT,
  mediation_no TEXT,
  location TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  price TEXT NOT NULL,
  price_display TEXT,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  maps_url TEXT,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_status ON properties (status);
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties (created_at DESC);

-- ─── News ───
CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image TEXT,
  category TEXT DEFAULT 'عام',
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_status ON news (status);
CREATE INDEX IF NOT EXISTS idx_news_created_at ON news (created_at DESC);

-- ─── Requests (طلبات العملاء + عروض الملاك) ───
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  phone TEXT NOT NULL,
  request_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_type ON requests (request_type);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests (created_at DESC);

-- ─── Subscriptions ───
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  name TEXT,
  interests TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON subscriptions (created_at DESC);

-- ─── updated_at triggers ───
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_properties_updated ON properties;
CREATE TRIGGER trg_properties_updated
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_news_updated ON news;
CREATE TRIGGER trg_news_updated
  BEFORE UPDATE ON news
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ─── Seed default settings ───
INSERT INTO settings (
  id, site_name, hero_title, hero_description,
  logo_url, banner_url, whatsapp, email, address,
  primary_color, secondary_color, extra
) VALUES (
  'main',
  'الهيف العقارية',
  'الهيف للخدمات العقارية',
  'خبرة وثقة في الخدمات والتسويق العقاري — نُقدّم لك تجربة عقارية راقية تليق بمستوى تطلعاتك',
  '/images/logo-alheef.png',
  'https://images.unsplash.com/photo-1600585154340-be6162a9a2c9?w=1920&q=85',
  '966500000000',
  'info@alheef.com',
  'الرياض، المملكة العربية السعودية',
  '#1E2A38',
  '#C5A46D',
  '{"siteTagline":"للخدمات العقارية","heroLabel":"مكتب عقاري سحابي","heroBtnOffers":"تصفح العروض","heroBtnRequest":"اطلب عقارك","phone":"050 000 0000","instagram":"https://instagram.com/alheef","x":"https://x.com/alheef","textPrimary":"#111111","textSecondary":"#444444","buttonPrimary":"#1E2A38","border":"rgba(197, 164, 109, 0.32)"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ─── Row Level Security ───
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- قراءة عامة للموقع (anon)
DROP POLICY IF EXISTS settings_public_read ON settings;
CREATE POLICY settings_public_read ON settings
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS properties_public_read ON properties;
CREATE POLICY properties_public_read ON properties
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS news_public_read ON news;
CREATE POLICY news_public_read ON news
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

-- لا وصول عام لطلبات الاشتراكات (الخادم يستخدم service_role)
DROP POLICY IF EXISTS requests_no_public ON requests;
CREATE POLICY requests_no_public ON requests
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS subscriptions_no_public ON subscriptions;
CREATE POLICY subscriptions_no_public ON subscriptions
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

-- ─── Storage bucket (نفّذ من Dashboard أو API إن لزم) ───
-- INSERT INTO storage.buckets (id, name, public) VALUES ('alheef-assets', 'alheef-assets', true);

-- DROP POLICY IF EXISTS alheef_assets_public_read ON storage.objects;
-- CREATE POLICY alheef_assets_public_read ON storage.objects
--   FOR SELECT TO anon, authenticated
--   USING (bucket_id = 'alheef-assets');
