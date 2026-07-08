-- إشعارات مراجعة إعلانات المسوقين + حالة مرفوض + تتبع النشر

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_status_check CHECK (
  status IN (
    'draft', 'pending_review', 'needs_changes', 'approved_published',
    'published', 'hidden', 'expired', 'archived', 'sold', 'rejected'
  )
);

ALTER TABLE properties ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS homepage_published BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'property_pending_review',
  title TEXT NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  marketer_id UUID REFERENCES marketers(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON admin_notifications(is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_property ON admin_notifications(property_id);
