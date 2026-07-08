-- اشتراكات Push Notifications (PWA)

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
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_client ON push_subscriptions(client_key) WHERE client_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_offers ON push_subscriptions(offers_enabled, is_active) WHERE role = 'client';
