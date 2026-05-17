ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(10) NOT NULL DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS stripe_payment_intent VARCHAR(100);

-- Enforce valid values for existing and future rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_method_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('cod', 'stripe'));
  END IF;
END $$;
