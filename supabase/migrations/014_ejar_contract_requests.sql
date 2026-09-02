-- معالج إنشاء عقد إيجار: رقم طلب فريد وحالات متابعة العقد
ALTER TABLE requests ADD COLUMN IF NOT EXISTS reference_no TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_reference_no
  ON requests (reference_no)
  WHERE reference_no IS NOT NULL AND reference_no <> '';

CREATE INDEX IF NOT EXISTS idx_requests_type_created
  ON requests (request_type, created_at DESC);

ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_status_check CHECK (
  status IN (
    'new',
    'in_progress',
    'done',
    'cancelled',
    'under_review',
    'missing_data',
    'ready_to_create',
    'contract_created',
    'sent_for_auth',
    'authenticated'
  )
);
