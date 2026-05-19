-- حقول إضافية للخريطة العقارية (نفّذ في SQL Editor إن كان المشروع منشأً مسبقاً)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS plot_number TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS plan_number TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS street_width TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT 'fixed';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS contact_phone TEXT;

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_price_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_price_type_check
  CHECK (price_type IS NULL OR price_type IN ('fixed', 'auction'));

NOTIFY pgrst, 'reload schema';
