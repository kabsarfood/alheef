-- ═══════════════════════════════════════════════════════════════════════════
-- 016 — حسابات مركزية بالجوال (phone = Account ID) + أدوار منفصلة
-- OTP يثبت ملكية الرقم فقط؛ الصلاحيات من app_user_roles
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT app_users_phone_format CHECK (phone ~ '^05[0-9]{8}$'),
  CONSTRAINT app_users_phone_unique UNIQUE (phone),
  CONSTRAINT app_users_phone_e164_unique UNIQUE (phone_e164)
);

CREATE TABLE IF NOT EXISTS public.app_user_roles (
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK (role IN ('client', 'marketer', 'staff', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.app_users(id),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_app_user_roles_role ON public.app_user_roles(role);
CREATE INDEX IF NOT EXISTS idx_app_users_phone ON public.app_users(phone);

ALTER TABLE public.marketers
  ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES public.app_users(id);

ALTER TABLE public.private_client_access
  ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES public.app_users(id);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_users FROM anon, authenticated;
REVOKE ALL ON TABLE public.app_user_roles FROM anon, authenticated;
GRANT ALL ON TABLE public.app_users TO service_role;
GRANT ALL ON TABLE public.app_user_roles TO service_role;

NOTIFY pgrst, 'reload schema';
