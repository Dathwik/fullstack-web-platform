ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(100),
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS customers_password_reset_token_idx ON customers(password_reset_token);
