CREATE TABLE IF NOT EXISTS stock_movements (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta_kg    DECIMAL(8,2) NOT NULL,
  type        VARCHAR(30) NOT NULL CHECK (type IN ('order_placed', 'order_restored', 'manual_restock')),
  order_id    UUID        REFERENCES orders(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX stock_movements_product_id_idx ON stock_movements(product_id);
CREATE INDEX stock_movements_created_at_idx ON stock_movements(created_at DESC);
