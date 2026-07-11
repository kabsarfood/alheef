-- عملاء بروابط مستقلة + إحصائيات الزوار

CREATE TABLE IF NOT EXISTS private_offers_settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO private_offers_settings (id, active) VALUES ('main', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS private_client_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_label TEXT NOT NULL DEFAULT '',
  page_slug TEXT NOT NULL UNIQUE,
  access_code_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  visit_count INT NOT NULL DEFAULT 0,
  login_count INT NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_private_client_access_slug ON private_client_access (page_slug);
CREATE INDEX IF NOT EXISTS idx_private_client_access_active ON private_client_access (active);

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

-- ترحيل الرابط القديم الوحيد إن وُجد
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'private_offers_access'
  ) THEN
    INSERT INTO private_client_access (client_label, page_slug, access_code_hash, active, created_at, updated_at)
    SELECT
      'عميل 1',
      page_slug,
      COALESCE(access_code_hash, ''),
      active,
      created_at,
      updated_at
    FROM private_offers_access
    WHERE id = 'main' AND page_slug IS NOT NULL AND access_code_hash IS NOT NULL
    ON CONFLICT (page_slug) DO NOTHING;

    INSERT INTO private_offers_settings (id, active, updated_at)
    SELECT 'main', active, updated_at FROM private_offers_access WHERE id = 'main'
    ON CONFLICT (id) DO UPDATE SET
      active = EXCLUDED.active,
      updated_at = EXCLUDED.updated_at;
  END IF;
END $$;

ALTER TABLE private_offers_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_sessions ENABLE ROW LEVEL SECURITY;
