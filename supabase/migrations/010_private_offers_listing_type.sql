-- نوع العرض في العروض الخاصة: بيع / إيجار
ALTER TABLE private_offers
  ADD COLUMN IF NOT EXISTS listing_type TEXT NOT NULL DEFAULT 'sale';

ALTER TABLE private_offers
  DROP CONSTRAINT IF EXISTS private_offers_listing_type_check;

ALTER TABLE private_offers
  ADD CONSTRAINT private_offers_listing_type_check
  CHECK (listing_type IN ('sale', 'rent'));

CREATE INDEX IF NOT EXISTS idx_private_offers_listing_type
  ON private_offers (listing_type);
