-- بريد المسوق + كلمة مرور مشفّرة + استعادة الحساب

ALTER TABLE marketer_join_requests ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE marketer_join_requests ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE marketers ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketer_join_email_unique
  ON marketer_join_requests(lower(trim(email)))
  WHERE email IS NOT NULL AND trim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketers_email_unique
  ON marketers(lower(trim(email)))
  WHERE email IS NOT NULL AND trim(email) <> '';

CREATE TABLE IF NOT EXISTS marketer_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketer_id UUID NOT NULL REFERENCES marketers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketer_reset_tokens_marketer
  ON marketer_password_reset_tokens(marketer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketer_reset_tokens_expires
  ON marketer_password_reset_tokens(expires_at)
  WHERE used_at IS NULL;
