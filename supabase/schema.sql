-- ═══════════════════════════════════════════════════════════════════════════
-- الهيف للخدمات العقارية — مخطط قاعدة البيانات الكامل
-- نفّذ هذا الملف كاملاً في: Supabase → SQL Editor → Run
-- لا حاجة لتعديل إضافي
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Extensions (UUID) ───
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── إزالة الهيكل القديم ───
DROP TABLE IF EXISTS property_images CASCADE;
DROP TABLE IF EXISTS properties CASCADE;
DROP TABLE IF EXISTS news CASCADE;
DROP TABLE IF EXISTS requests CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS banners CASCADE;
DROP TABLE IF EXISTS testimonials CASCADE;
DROP TABLE IF EXISTS dashboard_users CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- ─── دوال مساعدة ───
CREATE OR REPLACE FUNCTION slugify(input TEXT)
RETURNS TEXT AS $$
DECLARE
  s TEXT;
BEGIN
  s := lower(trim(coalesce(input, '')));
  s := regexp_replace(s, '[^a-z0-9\u0600-\u06FF]+', '-', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := trim(both '-' from s);
  IF s = '' THEN s := 'item'; END IF;
  RETURN s;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) settings
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  site_name TEXT NOT NULL DEFAULT 'الهيف للخدمات العقارية',
  site_description TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  hero_image TEXT,
  hero_mobile_image TEXT,
  whatsapp_number TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  google_map TEXT,
  instagram TEXT,
  twitter TEXT,
  snapchat TEXT,
  tiktok TEXT,
  primary_color TEXT NOT NULL DEFAULT '#1E2A38',
  secondary_color TEXT NOT NULL DEFAULT '#C5A46D',
  footer_text TEXT,
  about_text TEXT,
  vision_text TEXT,
  mission_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) properties
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  property_type TEXT NOT NULL,
  listing_type TEXT NOT NULL DEFAULT 'sale',
  city TEXT NOT NULL,
  district TEXT,
  street TEXT,
  price NUMERIC(14, 2),
  bedrooms INT,
  bathrooms INT,
  area NUMERIC(12, 2),
  age INT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  video_url TEXT,
  maps_url TEXT,
  cover_image TEXT,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  featured BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft',
  agent_name TEXT,
  agent_phone TEXT,
  reference_no TEXT,
  plot_number TEXT,
  plan_number TEXT,
  direction TEXT,
  street_width TEXT,
  price_type TEXT DEFAULT 'fixed',
  contact_phone TEXT,
  views_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT properties_status_check CHECK (status IN ('draft', 'published', 'sold', 'archived')),
  CONSTRAINT properties_listing_type_check CHECK (listing_type IN ('sale', 'rent', 'buy_request')),
  CONSTRAINT properties_price_type_check CHECK (price_type IS NULL OR price_type IN ('fixed', 'auction'))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) property_images
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE property_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) news
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  image TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT news_status_check CHECK (status IN ('draft', 'published', 'archived'))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) requests
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  request_type TEXT NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT requests_status_check CHECK (status IN ('new', 'in_progress', 'done', 'cancelled'))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) subscriptions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) banners
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  image_desktop TEXT NOT NULL,
  image_mobile TEXT,
  button_text TEXT,
  button_link TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) testimonials
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  comment TEXT NOT NULL,
  rating INT NOT NULL DEFAULT 5,
  image TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT testimonials_rating_check CHECK (rating >= 1 AND rating <= 5)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) dashboard_users
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE dashboard_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dashboard_users_role_check CHECK (role IN ('admin', 'editor'))
);

-- ─── Triggers ───
CREATE TRIGGER trg_settings_updated
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_properties_updated
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_news_updated
  BEFORE UPDATE ON news
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Indexes ───
CREATE INDEX idx_properties_city ON properties (city);
CREATE INDEX idx_properties_district ON properties (district);
CREATE INDEX idx_properties_property_type ON properties (property_type);
CREATE INDEX idx_properties_listing_type ON properties (listing_type);
CREATE INDEX idx_properties_price ON properties (price);
CREATE INDEX idx_properties_status ON properties (status);
CREATE INDEX idx_properties_featured ON properties (featured) WHERE featured = true;
CREATE INDEX idx_properties_created_at ON properties (created_at DESC);
CREATE INDEX idx_properties_slug ON properties (slug);
CREATE INDEX idx_properties_reference_no ON properties (reference_no) WHERE reference_no IS NOT NULL;
CREATE INDEX idx_properties_map ON properties (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND status = 'published';

CREATE INDEX idx_property_images_property ON property_images (property_id, sort_order);
CREATE INDEX idx_news_slug ON news (slug);
CREATE INDEX idx_news_status ON news (status);
CREATE INDEX idx_news_created_at ON news (created_at DESC);
CREATE INDEX idx_requests_status ON requests (status);
CREATE INDEX idx_requests_created_at ON requests (created_at DESC);
CREATE INDEX idx_subscriptions_email ON subscriptions (email);
CREATE INDEX idx_banners_active_sort ON banners (active, sort_order);
CREATE INDEX idx_testimonials_active ON testimonials (active, created_at DESC);
CREATE INDEX idx_dashboard_users_username ON dashboard_users (username);

-- ─── Seed: إعدادات افتراضية ───
INSERT INTO settings (
  id,
  site_name,
  site_description,
  logo_url,
  favicon_url,
  hero_title,
  hero_subtitle,
  hero_image,
  hero_mobile_image,
  whatsapp_number,
  email,
  phone,
  address,
  primary_color,
  secondary_color,
  footer_text,
  about_text,
  vision_text,
  mission_text
) VALUES (
  'main',
  'الهيف للخدمات العقارية',
  'مكتب عقاري اكتروني — خبرة وثقة في التسويق والخدمات العقارية',
  '/images/logo-alheef.png',
  '/assets/favicon.png',
  'الهيف للخدمات العقارية',
  'مكتب عقاري اكتروني',
  'https://images.unsplash.com/photo-1600585154340-be6162a9a2c9?w=1920&q=85',
  'https://images.unsplash.com/photo-1600585154340-be6162a9a2c9?w=960&q=80',
  '966500000000',
  'info@alheef.com',
  '050 000 0000',
  'الرياض، المملكة العربية السعودية',
  '#1E2A38',
  '#C5A46D',
  '© الهيف للخدمات العقارية — جميع الحقوق محفوظة',
  'مكتب عقاري اكتروني يقدم خدمات التسويق والبيع وإدارة الأملاك بمعايير احترافية راقية.',
  'أن نكون الخيار الأول للخدمات العقارية الراقية في المملكة.',
  'تقديم تجربة عقارية موثوقة وشفافة تليق بتطلعات عملائنا.'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;

-- إزالة سياسات قديمة (إعادة التشغيل الآمن)
DROP POLICY IF EXISTS settings_public_read ON settings;
DROP POLICY IF EXISTS properties_public_read ON properties;
DROP POLICY IF EXISTS property_images_public_read ON property_images;
DROP POLICY IF EXISTS news_public_read ON news;
DROP POLICY IF EXISTS banners_public_read ON banners;
DROP POLICY IF EXISTS testimonials_public_read ON testimonials;
DROP POLICY IF EXISTS requests_no_anon ON requests;
DROP POLICY IF EXISTS subscriptions_no_anon ON subscriptions;
DROP POLICY IF EXISTS dashboard_users_no_anon ON dashboard_users;
DROP POLICY IF EXISTS storage_public_read ON storage.objects;

-- ─── Policies: قراءة عامة ───
CREATE POLICY settings_public_read ON settings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY properties_public_read ON properties
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY property_images_public_read ON property_images
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_images.property_id
        AND p.status = 'published'
    )
  );

CREATE POLICY news_public_read ON news
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY banners_public_read ON banners
  FOR SELECT TO anon, authenticated
  USING (active = true);

CREATE POLICY testimonials_public_read ON testimonials
  FOR SELECT TO anon, authenticated
  USING (active = true);

-- ─── Policies: منع الكتابة العامة (الخادم يستخدم service_role) ───
CREATE POLICY requests_no_anon ON requests
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY subscriptions_no_anon ON subscriptions
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY dashboard_users_no_anon ON dashboard_users
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- Storage Buckets
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('alheef-assets', 'alheef-assets', true, 8388608),
  ('property-images', 'property-images', true, 10485760),
  ('banners', 'banners', true, 8388608),
  ('logos', 'logos', true, 4194304),
  ('news', 'news', true, 8388608)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

CREATE POLICY storage_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id IN (
      'alheef-assets',
      'property-images',
      'banners',
      'logos',
      'news'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 11) نظام فريق المسوقين + مراجعة الإعلانات (004 + 005)
-- ═══════════════════════════════════════════════════════════════════════════

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

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_status_check CHECK (
  status IN (
    'draft', 'pending_review', 'needs_changes', 'approved_published',
    'published', 'hidden', 'expired', 'archived', 'sold', 'rejected'
  )
);

CREATE INDEX IF NOT EXISTS idx_properties_marketer ON properties(marketer_id);
CREATE INDEX IF NOT EXISTS idx_properties_license_expires ON properties(license_expires_at);

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

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'marketer', 'client')),
  user_id TEXT,
  marketer_id UUID REFERENCES marketers(id) ON DELETE CASCADE,
  client_key TEXT,
  email TEXT,
  preferences JSONB NOT NULL DEFAULT '{}',
  offers_enabled BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_role ON push_subscriptions(role, is_active);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_marketer ON push_subscriptions(marketer_id) WHERE marketer_id IS NOT NULL;

ALTER TABLE marketer_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketer_join_requests_no_anon ON marketer_join_requests;
DROP POLICY IF EXISTS marketers_no_anon ON marketers;
DROP POLICY IF EXISTS admin_notifications_no_anon ON admin_notifications;
DROP POLICY IF EXISTS push_subscriptions_no_anon ON push_subscriptions;

CREATE POLICY marketer_join_requests_no_anon ON marketer_join_requests
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY marketers_no_anon ON marketers
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY admin_notifications_no_anon ON admin_notifications
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY push_subscriptions_no_anon ON push_subscriptions
  FOR ALL TO anon USING (false) WITH CHECK (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- العروض الخاصة
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS private_offers_access (
  id TEXT PRIMARY KEY DEFAULT 'main',
  page_slug TEXT NOT NULL UNIQUE,
  access_code_hash TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS private_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_number TEXT NOT NULL UNIQUE,
  listing_type TEXT NOT NULL DEFAULT 'sale',
  property_type TEXT NOT NULL DEFAULT 'other',
  area NUMERIC(12, 2),
  street TEXT,
  plot_number TEXT,
  plan_number TEXT,
  price NUMERIC(14, 2),
  location TEXT,
  show_location BOOLEAN NOT NULL DEFAULT true,
  short_description TEXT,
  cover_image TEXT,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'available',
  internal_notes TEXT,
  visible BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT private_offers_listing_type_check CHECK (listing_type IN ('sale', 'rent'))
);

CREATE INDEX IF NOT EXISTS idx_private_offers_active ON private_offers (active, visible, sort_order);
CREATE INDEX IF NOT EXISTS idx_private_offers_number ON private_offers (offer_number);

ALTER TABLE private_offers_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_offers ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- عملاء بروابط مستقلة + إحصائيات الزوار
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS private_offers_settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS private_client_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_label TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  request_type TEXT NOT NULL DEFAULT 'buy',
  property_kind TEXT NOT NULL DEFAULT 'land',
  required_area NUMERIC(12, 2),
  page_slug TEXT NOT NULL UNIQUE,
  access_code_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  visit_count INT NOT NULL DEFAULT 0,
  login_count INT NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT private_client_access_request_type_check CHECK (request_type IN ('buy', 'rent')),
  CONSTRAINT private_client_access_property_kind_check CHECK (property_kind IN ('land', 'villa', 'building'))
);

CREATE INDEX IF NOT EXISTS idx_private_client_access_slug ON private_client_access (page_slug);

CREATE TABLE IF NOT EXISTS site_visit_stats (
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  page_path TEXT NOT NULL DEFAULT '/',
  views INT NOT NULL DEFAULT 0,
  PRIMARY KEY (visit_date, page_path)
);

CREATE TABLE IF NOT EXISTS site_visit_sessions (
  session_key TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  page_count INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS site_visit_page_sessions (
  visit_date DATE NOT NULL,
  page_path TEXT NOT NULL,
  session_key TEXT NOT NULL,
  PRIMARY KEY (visit_date, page_path, session_key)
);

CREATE INDEX IF NOT EXISTS idx_site_visit_page_sessions_date_path
  ON site_visit_page_sessions (visit_date, page_path);

ALTER TABLE private_offers_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_page_sessions ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- إعادة تحميل مخطط PostgREST
-- ═══════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
