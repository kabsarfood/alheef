-- بيانات طلب العميل في العروض الخاصة
ALTER TABLE private_client_access
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';

ALTER TABLE private_client_access
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'buy';

ALTER TABLE private_client_access
  ADD COLUMN IF NOT EXISTS property_kind TEXT NOT NULL DEFAULT 'land';

ALTER TABLE private_client_access
  ADD COLUMN IF NOT EXISTS required_area NUMERIC(12, 2);

ALTER TABLE private_client_access
  DROP CONSTRAINT IF EXISTS private_client_access_request_type_check;

ALTER TABLE private_client_access
  ADD CONSTRAINT private_client_access_request_type_check
  CHECK (request_type IN ('buy', 'rent'));

ALTER TABLE private_client_access
  DROP CONSTRAINT IF EXISTS private_client_access_property_kind_check;

ALTER TABLE private_client_access
  ADD CONSTRAINT private_client_access_property_kind_check
  CHECK (property_kind IN ('land', 'villa', 'building'));
