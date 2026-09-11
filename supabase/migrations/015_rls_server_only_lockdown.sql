-- ═══════════════════════════════════════════════════════════════════════════
-- 015 — قفل Server-only: RLS بدون سياسات عامة + Least Privilege
-- الجداول تُستخدم من Node.js عبر service_role فقط (لا PostgREST من المتصفح)
-- آمن للتكرار (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) تفعيل RLS على الجداول الحساسة غير المحمية ───
ALTER TABLE public.marketers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketer_password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ejar_review_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_offers_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ejar_reviews ENABLE ROW LEVEL SECURITY;

-- تأكيد RLS على جداول Server-only الأخرى دون إنشاء سياسات عامة
ALTER TABLE public.marketer_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_offers_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_page_sessions ENABLE ROW LEVEL SECURITY;

-- ─── 2) إسقاط سياسة Always True الحيّة (الاسم من قاعدة الإنتاج) ───
DROP POLICY IF EXISTS "Allow public marketer applications" ON public.marketer_join_requests;

-- ─── 3) Least Privilege: سحب صلاحيات anon/authenticated ───
-- التطبيق لا يستخدم PostgREST بهذين الدورين على هذه الجداول
REVOKE ALL ON TABLE public.marketers FROM anon, authenticated;
REVOKE ALL ON TABLE public.marketer_password_reset_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.site_visit_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.private_client_access FROM anon, authenticated;
REVOKE ALL ON TABLE public.ejar_review_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
REVOKE ALL ON TABLE public.private_offers_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.site_visit_stats FROM anon, authenticated;
REVOKE ALL ON TABLE public.ejar_reviews FROM anon, authenticated;
REVOKE ALL ON TABLE public.marketer_join_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_notifications FROM anon, authenticated;
REVOKE ALL ON TABLE public.private_offers FROM anon, authenticated;
REVOKE ALL ON TABLE public.private_offers_access FROM anon, authenticated;
REVOKE ALL ON TABLE public.site_visit_page_sessions FROM anon, authenticated;

-- الإبقاء على صلاحيات service_role (تجاوز RLS)
GRANT ALL ON TABLE public.marketers TO service_role;
GRANT ALL ON TABLE public.marketer_password_reset_tokens TO service_role;
GRANT ALL ON TABLE public.site_visit_sessions TO service_role;
GRANT ALL ON TABLE public.private_client_access TO service_role;
GRANT ALL ON TABLE public.ejar_review_tokens TO service_role;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;
GRANT ALL ON TABLE public.private_offers_settings TO service_role;
GRANT ALL ON TABLE public.site_visit_stats TO service_role;
GRANT ALL ON TABLE public.ejar_reviews TO service_role;
GRANT ALL ON TABLE public.marketer_join_requests TO service_role;
GRANT ALL ON TABLE public.admin_notifications TO service_role;
GRANT ALL ON TABLE public.private_offers TO service_role;
GRANT ALL ON TABLE public.private_offers_access TO service_role;
GRANT ALL ON TABLE public.site_visit_page_sessions TO service_role;

-- ─── 4) تثبيت search_path دون تغيير منطق الدوال ───
-- التوقيع الحي: public.slugify(input text) / public.set_updated_at()
ALTER FUNCTION public.slugify(input text) SET search_path TO pg_catalog, public;
ALTER FUNCTION public.set_updated_at() SET search_path TO pg_catalog, public;

NOTIFY pgrst, 'reload schema';
