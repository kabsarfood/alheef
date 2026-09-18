-- ═══════════════════════════════════════════════════════════════════════════
-- 017 — قاعدة جهات اتصال مركزية (مستقلة عن صلاحيات الدخول)
-- Account Roles = app_user_roles | Contact/Business Roles = contact_business_roles
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized TEXT NOT NULL,
  phone_display TEXT,
  name TEXT,
  app_user_id UUID UNIQUE REFERENCES public.app_users(id) ON DELETE SET NULL,
  marketing_opt_in BOOLEAN,
  marketing_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (marketing_status IN ('unknown', 'opted_in', 'opted_out', 'suppressed')),
  do_not_contact BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contacts_phone_format CHECK (phone_normalized ~ '^05[0-9]{8}$'),
  CONSTRAINT contacts_phone_unique UNIQUE (phone_normalized)
);

CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON public.contacts(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON public.contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_do_not_contact ON public.contacts(do_not_contact)
  WHERE do_not_contact = true;

-- صفات عمل / أعمال (تراكمية — لا تستبدل القديمة)
CREATE TABLE IF NOT EXISTS public.contact_business_roles (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK (role IN (
      'landlord',
      'tenant',
      'broker',
      'marketer',
      'client',
      'staff',
      'private_client',
      'inquirer',
      'owner'
    )),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, role)
);

CREATE INDEX IF NOT EXISTS idx_contact_business_roles_role ON public.contact_business_roles(role);

-- مصادر ظهور الرقم (سجل تراكمي)
CREATE TABLE IF NOT EXISTS public.contact_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  source TEXT NOT NULL
    CHECK (source IN (
      'ejar_contract',
      'private_offer',
      'marketer',
      'property_inquiry',
      'manual_import',
      'website',
      'whatsapp',
      'otp_verify',
      'admin'
    )),
  source_ref TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_sources_dedupe
  ON public.contact_sources (contact_id, source, (COALESCE(source_ref, '')));

CREATE INDEX IF NOT EXISTS idx_contact_sources_source ON public.contact_sources(source);
CREATE INDEX IF NOT EXISTS idx_contact_sources_seen ON public.contact_sources(seen_at DESC);

-- ربط عكسي اختياري من حساب الدخول
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS contact_id UUID UNIQUE REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_business_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.contacts FROM anon, authenticated;
REVOKE ALL ON TABLE public.contact_business_roles FROM anon, authenticated;
REVOKE ALL ON TABLE public.contact_sources FROM anon, authenticated;

GRANT ALL ON TABLE public.contacts TO service_role;
GRANT ALL ON TABLE public.contact_business_roles TO service_role;
GRANT ALL ON TABLE public.contact_sources TO service_role;

NOTIFY pgrst, 'reload schema';
