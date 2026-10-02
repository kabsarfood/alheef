-- جهاز واحد لكل عميل عروض خاصة. لا يحذف صفوفًا. آمن لإعادة التشغيل.

ALTER TABLE private_client_access ADD COLUMN IF NOT EXISTS device_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE private_client_access ADD COLUMN IF NOT EXISTS device_token_hash TEXT;
ALTER TABLE private_client_access ADD COLUMN IF NOT EXISTS device_bound_at TIMESTAMPTZ;
ALTER TABLE private_client_access ADD COLUMN IF NOT EXISTS device_last_seen_at TIMESTAMPTZ;
ALTER TABLE private_client_access ADD COLUMN IF NOT EXISTS device_label TEXT;
ALTER TABLE private_client_access ADD COLUMN IF NOT EXISTS access_epoch INT NOT NULL DEFAULT 1;
ALTER TABLE private_client_access ADD COLUMN IF NOT EXISTS device_attempts JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE private_client_access DROP CONSTRAINT IF EXISTS private_client_device_status_check;
ALTER TABLE private_client_access ADD CONSTRAINT private_client_device_status_check
  CHECK (device_status IN ('none', 'active', 'revoked'));
