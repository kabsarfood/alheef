-- زوار فريدون لكل صفحة (يوم + مسار + session_key)

CREATE TABLE IF NOT EXISTS site_visit_page_sessions (
  visit_date DATE NOT NULL,
  page_path TEXT NOT NULL,
  session_key TEXT NOT NULL,
  PRIMARY KEY (visit_date, page_path, session_key)
);

CREATE INDEX IF NOT EXISTS idx_site_visit_page_sessions_date_path
  ON site_visit_page_sessions (visit_date, page_path);

ALTER TABLE site_visit_page_sessions ENABLE ROW LEVEL SECURITY;
