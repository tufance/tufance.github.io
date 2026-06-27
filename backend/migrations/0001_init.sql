CREATE TABLE IF NOT EXISTS portfolios (
  email      TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portfolios_updated_at ON portfolios(updated_at);
