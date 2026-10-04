-- اهتمامات مشاركة الإعلان. لا تحذف صفوفًا. آمنة لإعادة التشغيل.

ALTER TABLE private_client_access ADD COLUMN IF NOT EXISTS followup_paused BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS private_offer_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_access_id TEXT NOT NULL,
  property_id UUID,
  internal_ref TEXT NOT NULL DEFAULT '',
  property_title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_followup',
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  followup_due_at TIMESTAMPTZ NOT NULL,
  followup_sent_at TIMESTAMPTZ,
  followup_claim_at TIMESTAMPTZ,
  followup_skipped_at TIMESTAMPTZ,
  last_reply TEXT NOT NULL DEFAULT '',
  last_reply_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT private_offer_leads_status_check CHECK (status IN (
    'pending_followup', 'interested', 'not_interested', 'wants_alternatives', 'negotiating', 'stopped', 'closed'
  ))
);

CREATE INDEX IF NOT EXISTS idx_private_offer_leads_client
  ON private_offer_leads (client_access_id, shared_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_offer_leads_due
  ON private_offer_leads (followup_due_at)
  WHERE followup_sent_at IS NULL AND followup_skipped_at IS NULL;

CREATE TABLE IF NOT EXISTS private_offer_lead_codes (
  code_hash TEXT PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES private_offer_leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT private_offer_lead_codes_action_check CHECK (action IN (
    'yes', 'no', 'more', 'stop', 'more_yes', 'more_no'
  ))
);

ALTER TABLE private_offer_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_offer_lead_codes ENABLE ROW LEVEL SECURITY;
