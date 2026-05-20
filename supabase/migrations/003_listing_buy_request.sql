-- غرض إضافي: طلب شراء
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_listing_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_listing_type_check
  CHECK (listing_type IN ('sale', 'rent', 'buy_request'));

NOTIFY pgrst, 'reload schema';
