-- البريد الإلكتروني وكلمة المرور واستعادة الحساب — فريق المسوقين

ALTER TABLE marketer_join_requests ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE marketer_join_requests ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE marketers ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketers_phone_unique ON marketers (phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketers_email_lower ON marketers (LOWER(email)) WHERE email IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_join_requests_phone_pending
  ON marketer_join_requests (phone) WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_join_requests_email_lower_pending
  ON marketer_join_requests (LOWER(email)) WHERE status = 'pending' AND email IS NOT NULL AND email <> '';

CREATE TABLE IF NOT EXISTS marketer_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketer_id UUID NOT NULL REFERENCES marketers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketer_reset_tokens_marketer ON marketer_password_reset_tokens(marketer_id);
CREATE INDEX IF NOT EXISTS idx_marketer_reset_tokens_hash ON marketer_password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_marketer_reset_tokens_expires ON marketer_password_reset_tokens(expires_at);
