-- تقييمات عقود الإيجار — روابط Token + التقييمات

CREATE TABLE IF NOT EXISTS ejar_review_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ejar_review_tokens_request ON ejar_review_tokens(request_id);
CREATE INDEX IF NOT EXISTS idx_ejar_review_tokens_hash ON ejar_review_tokens(token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ejar_review_tokens_one_active
  ON ejar_review_tokens(request_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS ejar_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  review_token_id UUID NOT NULL UNIQUE REFERENCES ejar_review_tokens(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  display_name TEXT,
  city TEXT,
  publish_consent BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ejar_reviews_status ON ejar_reviews(status, publish_consent);
CREATE INDEX IF NOT EXISTS idx_ejar_reviews_request ON ejar_reviews(request_id);
