-- العروض الخاصة — صفحة خاصة برمز دخول
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_private_offers_active ON private_offers (active, visible, sort_order);
CREATE INDEX IF NOT EXISTS idx_private_offers_number ON private_offers (offer_number);

ALTER TABLE private_offers_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_offers ENABLE ROW LEVEL SECURITY;
