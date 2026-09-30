-- أعمدة بيانات العقار الأساسية + رقم الهيف الداخلي.
-- لا يحذف أي عمود. آمن لإعادة التشغيل.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS plot_number TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS plan_number TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS street_width TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT 'fixed';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS internal_ref TEXT;

-- انسخ القيم القديمة من features دون مسحها، ومن دون نسخ الواجهة إلى الاتجاه.
UPDATE properties
SET
  plot_number = COALESCE(NULLIF(btrim(plot_number), ''), NULLIF(btrim(features->>'plot_number'), ''), NULLIF(btrim(features->>'plotNumber'), '')),
  plan_number = COALESCE(NULLIF(btrim(plan_number), ''), NULLIF(btrim(features->>'plan_number'), ''), NULLIF(btrim(features->>'planNumber'), '')),
  direction = COALESCE(NULLIF(btrim(direction), ''), NULLIF(btrim(features->>'direction'), '')),
  street_width = COALESCE(NULLIF(btrim(street_width), ''), NULLIF(btrim(features->>'street_width'), ''), NULLIF(btrim(features->>'streetWidth'), '')),
  price_type = CASE
    WHEN price_type IN ('fixed', 'auction') THEN price_type
    WHEN features->>'price_type' IN ('fixed', 'auction') THEN features->>'price_type'
    WHEN features->>'priceType' IN ('fixed', 'auction') THEN features->>'priceType'
    ELSE 'fixed'
  END
WHERE jsonb_typeof(features) = 'object';

UPDATE properties
SET price_type = 'fixed'
WHERE price_type IS NULL OR price_type NOT IN ('fixed', 'auction');

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_price_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_price_type_check
  CHECK (price_type IS NULL OR price_type IN ('fixed', 'auction'));

-- رقم المهدية: H-MHD-000001. لا يُعاد ترقيم صف له رقم أصلًا.
WITH existing_max AS (
  SELECT COALESCE(MAX(CAST(substring(internal_ref FROM 7) AS INTEGER)), 0) AS n
  FROM properties
  WHERE internal_ref ~ '^H-MHD-[0-9]{6}$'
),
ranked AS (
  SELECT
    id,
    (SELECT n FROM existing_max) + row_number() OVER (ORDER BY created_at ASC, id ASC) AS n
  FROM properties
  WHERE (internal_ref IS NULL OR btrim(internal_ref) = '')
    AND (
      translate(replace(coalesce(district, ''), ' ', ''), 'أإآىة', 'ااايه') LIKE '%المهديه%'
      OR translate(replace(coalesce(city, ''), ' ', ''), 'أإآىة', 'ااايه') LIKE '%المهديه%'
      OR (
        (district IS NULL OR btrim(district) = '')
        AND translate(replace(coalesce(title, ''), ' ', ''), 'أإآىة', 'ااايه') LIKE '%المهديه%'
      )
    )
)
UPDATE properties AS p
SET internal_ref = 'H-MHD-' || lpad(ranked.n::text, 6, '0')
FROM ranked
WHERE p.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_internal_ref
  ON properties (internal_ref)
  WHERE internal_ref IS NOT NULL AND btrim(internal_ref) <> '';
