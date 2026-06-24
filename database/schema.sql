CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE order_status AS ENUM (
  'Received',
  'In Preparation',
  'Completed',
  'Cancelled'
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  price_per_kg DECIMAL(10,2) NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  stock_kg        DECIMAL(8,2),
  reorder_point_kg DECIMAL(8,2)
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100),
  address TEXT NOT NULL,
  status order_status DEFAULT 'Received',
  payment_received BOOLEAN DEFAULT FALSE,
  special_instructions TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  payment_method VARCHAR(10) NOT NULL DEFAULT 'cod' CHECK (payment_method IN ('cod', 'stripe')),
  stripe_payment_intent VARCHAR(100),
  created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX orders_customer_id_idx ON orders(customer_id);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity_kg DECIMAL(5,2) NOT NULL
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (order_id)
);

CREATE TABLE order_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX order_notes_order_id_idx ON order_notes(order_id);

CREATE TABLE webhook_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   VARCHAR(100) NOT NULL UNIQUE,
  event_type VARCHAR(50)  NOT NULL,
  payload    JSONB        NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX webhook_events_created_at_idx ON webhook_events(created_at DESC);

CREATE TABLE stock_movements (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta_kg    DECIMAL(8,2) NOT NULL,
  type        VARCHAR(30)  NOT NULL CHECK (type IN ('order_placed', 'order_restored', 'manual_restock')),
  order_id    UUID         REFERENCES orders(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX stock_movements_product_id_idx ON stock_movements(product_id);
CREATE INDEX stock_movements_created_at_idx ON stock_movements(created_at DESC);

INSERT INTO products (name, price_per_kg) VALUES
  ('Spicy Mixture', 12.50),
  ('Khara Boondi', 9.00),
  ('Mixture Namkeen', 11.00);
