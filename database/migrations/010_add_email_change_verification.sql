ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS pending_email VARCHAR(150),
  ADD COLUMN IF NOT EXISTS email_verify_token VARCHAR(100),
  ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS customers_email_verify_token_idx ON customers(email_verify_token);
