-- رابط إضافة يبقى مفتوحًا. الروابط القديمة تبقى لمرة واحدة.

ALTER TABLE map_submit_links
  ADD COLUMN IF NOT EXISTS reusable BOOLEAN NOT NULL DEFAULT FALSE;
