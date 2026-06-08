CREATE TABLE IF NOT EXISTS webhook_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   VARCHAR(100) NOT NULL UNIQUE,
  event_type VARCHAR(50)  NOT NULL,
  payload    JSONB        NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_events_created_at_idx ON webhook_events(created_at DESC);
