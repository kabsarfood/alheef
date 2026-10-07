-- عملاء OAuth ورموز موصل ChatGPT. الخدمة فقط تصل إليها، ولا تُفتح للواجهة.

CREATE TABLE IF NOT EXISTS chatgpt_oauth_clients (
  id TEXT PRIMARY KEY,
  redirect_uris JSONB NOT NULL,
  client_name TEXT,
  auth_method TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chatgpt_oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chatgpt_oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  client_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  replaced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chatgpt_oauth_tokens_kind_check CHECK (kind IN ('access', 'refresh'))
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_oauth_codes_expires
  ON chatgpt_oauth_codes (expires_at);

CREATE INDEX IF NOT EXISTS idx_chatgpt_oauth_tokens_expires
  ON chatgpt_oauth_tokens (expires_at);

ALTER TABLE chatgpt_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatgpt_oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatgpt_oauth_tokens ENABLE ROW LEVEL SECURITY;
